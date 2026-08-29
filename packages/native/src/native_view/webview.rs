//! macOS WKWebView host for Solo's `<webview>` element.
//!
//! A WKWebView is an AppKit NSView, not a GPUI element: it cannot be painted
//! into GPUI's scene, so it is attached to the real NSView hierarchy above
//! GPUI's opaque Metal surface and positioned from GPUI's layout bounds.
//!
//! GPUI owns layout; WebKit owns rendering and input. Nothing here is driven
//! from JavaScript.
//!
//! # Verification status
//!
//! **This module has never been compiled.** It is macOS-only, and the crate
//! cannot be built for a macOS target on a Linux host: `gpui_apple` needs
//! Apple's Metal shader compiler to produce `shaders.metallib`, and `media`
//! needs a real macOS SDK for bindgen. Every symbol below was checked against
//! the `objc2` 0.6.4 / `objc2-web-kit` 0.3.2 / `objc2-app-kit` 0.3.2 sources
//! in the local cargo registry, but the composition has not been through
//! rustc. Expect to fix compile errors here first when building on macOS.

use std::ffi::c_void;

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, ClassType, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::NSView;
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_foundation::{NSError, NSObject, NSObjectProtocol, NSString, NSURL, NSURLRequest};
use objc2_web_kit::{WKNavigation, WKNavigationDelegate, WKWebView, WKWebViewConfiguration};

use super::{NativeViewFrame, NativeViewInstance};
use crate::renderer::{emit_event_full, EventCallback};

// ── Event names ──────────────────────────────────────────────────────

/// Must match the native event types in `EVENT_PROPS`
/// (`packages/core/src/events.ts`).
const EVENT_NAVIGATION: &str = "navigation";
const EVENT_LOAD: &str = "load";
const EVENT_LOAD_ERROR: &str = "loadError";

/// Property keys accepted by [`MacWebView::set_content`].
const PROP_URL: &str = "url";
const PROP_USER_AGENT: &str = "userAgent";

// ── Navigation delegate ──────────────────────────────────────────────

/// State the delegate needs in order to emit. Immutable after construction.
///
/// The callback is `Arc<dyn Fn(EventPayload) + Send + Sync>`, so the delegate
/// can emit straight from a WebKit callback without touching GPUI's `App` and
/// without ever blocking on JavaScript.
struct DelegateIvars {
    element_id: u64,
    callback: Option<EventCallback>,
}

define_class!(
    /// Forwards WebKit navigation callbacks into Solo's event pipeline.
    ///
    /// One per mounted `<webview>`. Events always fire; the JS-side handler
    /// registry decides whether anything is listening, so a handler appearing
    /// or disappearing between frames needs no re-plumbing here.
    //
    // SAFETY:
    // - NSObject has no subclassing requirements.
    // - `DelegateIvars` has no `Drop` impl, so the class does not need one
    //   either.
    #[unsafe(super(NSObject))]
    // WebKit calls these methods on the main thread, and `WKNavigationDelegate`
    // is declared `MainThreadOnly`, so the class has to opt in to match.
    #[thread_kind = MainThreadOnly]
    #[ivars = DelegateIvars]
    struct SoloNavigationDelegate;

    unsafe impl NSObjectProtocol for SoloNavigationDelegate {}

    unsafe impl WKNavigationDelegate for SoloNavigationDelegate {
        /// A navigation started — the earliest meaningful signal, and the one
        /// that covers link clicks and redirects rather than just first loads.
        #[unsafe(method(webView:didStartProvisionalNavigation:))]
        #[unsafe(method_family = none)]
        unsafe fn webView_didStartProvisionalNavigation(
            &self,
            web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
        ) {
            let ivars = self.ivars();
            emit(&ivars.callback, ivars.element_id, EVENT_NAVIGATION, current_url(web_view));
        }

        /// Content finished arriving for the main frame.
        #[unsafe(method(webView:didFinishNavigation:))]
        #[unsafe(method_family = none)]
        unsafe fn webView_didFinishNavigation(
            &self,
            web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
        ) {
            let ivars = self.ivars();
            emit(&ivars.callback, ivars.element_id, EVENT_LOAD, current_url(web_view));
        }

        /// A committed navigation failed part-way through.
        #[unsafe(method(webView:didFailNavigation:withError:))]
        #[unsafe(method_family = none)]
        unsafe fn webView_didFailNavigation_withError(
            &self,
            web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            let ivars = self.ivars();
            emit(
                &ivars.callback,
                ivars.element_id,
                EVENT_LOAD_ERROR,
                failure_url(web_view, error),
            );
        }

        /// The navigation failed before committing: bad host, no network, or
        /// an unparseable URL. Often the only signal we get for a typo'd URL.
        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        #[unsafe(method_family = none)]
        unsafe fn webView_didFailProvisionalNavigation_withError(
            &self,
            web_view: &WKWebView,
            _navigation: Option<&WKNavigation>,
            error: &NSError,
        ) {
            let ivars = self.ivars();
            emit(
                &ivars.callback,
                ivars.element_id,
                EVENT_LOAD_ERROR,
                failure_url(web_view, error),
            );
        }
    }
);

impl SoloNavigationDelegate {
    fn new(
        mtm: MainThreadMarker,
        element_id: u64,
        callback: Option<EventCallback>,
    ) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DelegateIvars {
            element_id,
            callback,
        });
        unsafe { msg_send![super(this), init] }
    }
}

// ── Emitting ─────────────────────────────────────────────────────────

/// `EventPayload` has no message field, so a failure puts the reason after the
/// URL in `value`.
fn failure_url(web_view: &WKWebView, error: &NSError) -> Option<String> {
    let url = current_url(web_view).unwrap_or_default();
    let reason = error.localizedDescription().to_string();
    Some(format!("{url} — {reason}"))
}

fn current_url(web_view: &WKWebView) -> Option<String> {
    let url: Retained<NSURL> = unsafe { web_view.URL() }?;
    let absolute = url.absoluteString()?;
    Some(absolute.to_string())
}

fn emit(
    callback: &Option<EventCallback>,
    element_id: u64,
    event_type: &str,
    value: Option<String>,
) {
    let value = value.unwrap_or_default();
    emit_event_full(callback, element_id, event_type, move |payload| {
        payload.value = Some(value);
    });
}

// ── The native view ──────────────────────────────────────────────────

/// A WKWebView mounted as a child of Solo's GPUI window view.
pub struct MacWebView {
    element_id: u64,
    callback: Option<EventCallback>,
    view: Option<Retained<WKWebView>>,
    /// WebKit holds the navigation delegate weakly, so Solo must keep it
    /// alive for exactly as long as the WKWebView.
    delegate: Option<Retained<SoloNavigationDelegate>>,
    /// Last frame pushed to AppKit, so layout passes that produce identical
    /// geometry do not churn `setFrame:`.
    last_frame: Option<NativeViewFrame>,
    /// Last URL requested. `set_prop` runs every frame, so without this a
    /// single `url` write would reload the page on every render.
    last_url: Option<String>,
    last_user_agent: Option<String>,
    /// Whether the view is currently shown. Driven by frame area: a zero-area
    /// view keeps a web process alive for nothing, so it is hidden instead.
    visible: bool,
}

impl MacWebView {
    /// Create the host for `element_id`.
    ///
    /// Nothing is created until [`NativeViewInstance::mount`]; the view is
    /// built lazily once GPUI can supply a host.
    pub fn new(element_id: u64, callback: Option<EventCallback>) -> Self {
        Self {
            element_id,
            callback,
            view: None,
            delegate: None,
            last_frame: None,
            last_url: None,
            last_user_agent: None,
            visible: true,
        }
    }

    /// Navigate, reusing the existing WKWebView.
    ///
    /// A reactive `url` change must never rebuild the native view.
    fn load_url(&self, url: &str) {
        let Some(view) = self.view.as_ref() else {
            return;
        };
        let Some(ns_url) = NSURL::URLWithString(&NSString::from_str(url)) else {
            log::warn!("webview: ignoring malformed url {:?}", url);
            return;
        };
        let request = NSURLRequest::requestWithURL(&ns_url);
        unsafe { view.loadRequest(&request) };
    }
}

impl NativeViewInstance for MacWebView {
    fn mount(&mut self, host: *mut c_void) {
        if self.view.is_some() || host.is_null() {
            return;
        }

        // Everything below is main-thread-only: `WKWebView` and
        // `WKWebViewConfiguration` are both declared `MainThreadOnly`, and
        // `SoloNavigationDelegate` has to match `WKNavigationDelegate`. Solo's
        // `prepaint` runs inside the window's draw on the main thread, so this
        // is a formality — but `MainThreadMarker` makes the requirement a
        // compile-time one rather than a WebKit crash.
        let Some(mtm) = MainThreadMarker::new() else {
            log::error!("webview: mounted off the main thread, refusing to create a WKWebView");
            return;
        };

        // `host` is the GPUIView handed over by Solo's element. Appending the
        // WKWebView as its subview puts it above GPUI's layer-backed content,
        // which is what makes it visible at all: GPUI clears its Metal
        // drawable opaquely every frame, so anything *below* it is hidden.
        let host: &NSView = unsafe { &*(host as *const NSView) };
        let frame = self.last_frame.unwrap_or_default();
        let config: Retained<WKWebViewConfiguration> =
            unsafe { msg_send![WKWebViewConfiguration::alloc(mtm), init] };
        let view = unsafe {
            WKWebView::initWithFrame_configuration(
                WKWebView::alloc(mtm),
                native_rect(frame),
                &config,
            )
        };

        let delegate = SoloNavigationDelegate::new(mtm, self.element_id, self.callback.take());
        unsafe {
            view.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        }
        // Retained here, not just handed to WebKit: the property is weak.
        self.delegate = Some(delegate);

        view.setHidden(!self.visible);
        host.addSubview(&view);
        self.view = Some(view);

        // A URL set before the view existed still has to load.
        if let Some(url) = self.last_url.clone() {
            self.load_url(&url);
        }
    }

    fn update_frame(&mut self, frame: NativeViewFrame) {
        if self.last_frame == Some(frame) {
            return;
        }
        self.last_frame = Some(frame);

        // A zero-area view keeps compositing layers alive for a web process
        // that shows nothing, so hide rather than leave it mounted.
        let renderable = frame.is_renderable();
        if renderable != self.visible {
            self.visible = renderable;
            if let Some(view) = self.view.as_ref() {
                view.setHidden(!renderable);
            }
        }

        if let Some(view) = self.view.as_ref() {
            view.setFrame(native_rect(frame));
        }
    }

    fn set_content(&mut self, key: &str, value: Option<&str>) {
        match key {
            PROP_URL => {
                if self.last_url.as_deref() == value {
                    return;
                }
                self.last_url = value.map(str::to_string);
                if let Some(url) = value {
                    self.load_url(url);
                }
            }
            PROP_USER_AGENT => {
                if self.last_user_agent.as_deref() == value {
                    return;
                }
                self.last_user_agent = value.map(str::to_string);
                if let Some(view) = self.view.as_ref() {
                    let agent = value.map(NSString::from_str);
                    unsafe { view.setCustomUserAgent(agent.as_deref()) };
                }
            }
            _ => {}
        }
    }

    fn destroy(&mut self) {
        if let Some(view) = self.view.take() {
            view.removeFromSuperview();
        }
        // Dropping the delegate last: the WKWebView holds it weakly, so it must
        // stay alive until the view is gone. Both `Retained`s drop here.
        self.delegate = None;
        self.callback = None;
        self.last_frame = None;
        self.last_url = None;
        self.last_user_agent = None;
    }
}

/// Build the AppKit rect for a frame.
///
/// GPUI bounds are logical points and `to_native_frame` has already flipped Y,
/// so this is a plain conversion — no scale factor, since `NSView` frames are
/// points rather than device pixels.
fn native_rect(frame: NativeViewFrame) -> CGRect {
    CGRect {
        origin: CGPoint {
            x: frame.x as f64,
            y: frame.y as f64,
        },
        size: CGSize {
            width: frame.width as f64,
            height: frame.height as f64,
        },
    }
}
