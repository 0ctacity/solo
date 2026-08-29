//! `<webview>` — a native WKWebView embedded in a Solo window.
//!
//! This element does not paint web content. It returns a GPUI placeholder that
//! takes part in normal layout, and hands its post-layout bounds to the
//! native-view registry, which owns the real WKWebView. GPUI keeps ownership of
//! layout; AppKit keeps ownership of pixels and input.
//!
//! ```text
//! <webview url=…>
//!   → WebviewElement (CustomElement: props, events, destroy)
//!     → WebviewPlaceholder (gpui::Element: layout + bounds capture)
//!       → prepaint(bounds)
//!         → native_view::with_registry(… update_frame …)
//!           → WKWebView.setFrame:
//! ```
//!
use gpui::prelude::*;
use gpui::{
    App, Bounds, Element, ElementId, GlobalElementId, InspectorElementId, IntoElement, LayoutId,
    Pixels, Style, Window,
};

use crate::custom_elements::{CustomElement, CustomElementFactory, CustomRenderContext};
use crate::native_view::to_native_frame;
use crate::renderer::EventCallback;

/// Reserve the element's box. `relative(1.)` on both axes means the placeholder
/// fills whatever the retained tree's style gave it, so `<webview>` honours
/// `width: "100%"` and `flexGrow` like any other element.
fn placeholder_style() -> Style {
    let mut style = Style::default();
    style.size.width = gpui::relative(1.).into();
    style.size.height = gpui::relative(1.).into();
    // Flex items cannot shrink below their content without an explicit zero
    // minimum; a webview has no intrinsic size, so this is always safe.
    style.min_size.width = gpui::px(0.).into();
    style.min_size.height = gpui::px(0.).into();
    style.flex_grow = 1.0;
    style.flex_shrink = 1.0;
    style
}

/// The GPUI element that occupies layout space for a WKWebView.
///
/// Created fresh by `WebviewElement::render` every frame and discarded after
/// paint; all durable state lives in the registry, keyed by element ID.
struct WebviewPlaceholder {
    element_id: u64,
    url: Option<String>,
    user_agent: Option<String>,
    callback: Option<EventCallback>,
}

impl WebviewPlaceholder {
    /// Resolve the host NSView for Solo's GPUI window.
    ///
    /// Uses the public `HasWindowHandle` impl rather than reaching into GPUI's
    /// private `MacWindow`, so this needs no changes to the pinned GPUI fork.
    /// The handle is `GPUIView`, GPUI's own NSView subclass.
    ///
    /// The trait method has to be called explicitly: `Window` has an inherent
    /// `window_handle()` that returns GPUI's own `AnyWindowHandle` and would
    /// otherwise shadow it.
    fn host_view(window: &Window) -> *mut std::ffi::c_void {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};

        let Ok(handle) = HasWindowHandle::window_handle(window) else {
            log::warn!("webview: window has no native handle yet");
            return std::ptr::null_mut();
        };
        match handle.as_raw() {
            RawWindowHandle::AppKit(appkit) => appkit.ns_view.as_ptr(),
            _ => std::ptr::null_mut(),
        }
    }
}

impl Element for WebviewPlaceholder {
    type RequestLayoutState = ();
    type PrepaintState = ();

    fn id(&self) -> Option<ElementId> {
        None
    }

    fn source_location(&self) -> Option<&'static std::panic::Location<'static>> {
        None
    }

    fn request_layout(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        window: &mut Window,
        cx: &mut App,
    ) -> (LayoutId, Self::RequestLayoutState) {
        (window.request_layout(placeholder_style(), None, cx), ())
    }

    /// The one place with authoritative post-layout bounds.
    ///
    /// GPUI runs `request_layout → prepaint → paint` inside `Window::draw`, and
    /// `bounds` here is already in window space. This is also inside a redraw
    /// triggered by a window resize (`bounds_changed` calls `refresh`), so
    /// resizing needs no extra plumbing.
    fn prepaint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut Self::RequestLayoutState,
        window: &mut Window,
        _: &mut App,
    ) -> Self::PrepaintState {
        let content_height = window.viewport_size().height;
        let frame = to_native_frame(
            f32::from(bounds.origin.x),
            f32::from(bounds.origin.y),
            f32::from(bounds.size.width),
            f32::from(bounds.size.height),
            f32::from(content_height),
        );

        let host = Self::host_view(window);
        if host.is_null() {
            return;
        }

        let element_id = self.element_id;
        let url = self.url.clone();
        let user_agent = self.user_agent.clone();
        let callback = self.callback.clone();

        crate::native_view::with_registry(|registry| {
            registry.ensure_mounted(element_id, host, || {
                Box::new(crate::native_view::webview::MacWebView::new(element_id, callback))
            });
            registry.update_frame(element_id, frame);
            registry.set_content(element_id, "url", url.as_deref());
            registry.set_content(element_id, "userAgent", user_agent.as_deref());
        });
    }

    fn paint(
        &mut self,
        _: Option<&GlobalElementId>,
        _: Option<&InspectorElementId>,
        bounds: Bounds<Pixels>,
        _: &mut Self::RequestLayoutState,
        _: &mut Self::PrepaintState,
        window: &mut Window,
        _: &mut App,
    ) {
        // The WKWebView is an AppKit subview that swallows mouse events in its
        // own rect. Claim the same rect in GPUI's hit-test bookkeeping so a
        // click over the webview is not routed to an element underneath.
        window.insert_hitbox(bounds, gpui::HitboxBehavior::Normal);
    }
}

impl IntoElement for WebviewPlaceholder {
    type Element = Self;

    fn into_element(self) -> Self::Element {
        self
    }
}

// ── The custom element ───────────────────────────────────────────────

/// Retained-side state for `<webview>`.
///
/// Mirrors the `input` element's shape: the struct owns durable props, and each
/// frame pushes them into the placeholder.
pub struct WebviewElement {
    id: u64,
    url: Option<String>,
    user_agent: Option<String>,
    /// Emitted events carry the element ID, so it is captured at construction.
    callback: Option<EventCallback>,
}

impl WebviewElement {
    fn new(id: u64) -> Self {
        Self {
            id,
            url: None,
            user_agent: None,
            callback: None,
        }
    }
}

impl CustomElement for WebviewElement {
    fn render(
        &mut self,
        ctx: CustomRenderContext,
        _window: &mut Window,
        _cx: &mut gpui::Context<crate::renderer::SoloView>,
    ) -> gpui::AnyElement {
        self.callback = ctx.event_callback.clone();

        // The style from JSX (flexGrow, minHeight, …) is applied to the wrapper
        // so `<webview>` sizes like any other Solo element, without needing a
        // StyleDesc → gpui::Style conversion of our own.
        let mut wrapper = gpui::div();
        if let Some(style) = ctx.style {
            wrapper = crate::renderer::apply_styles(wrapper, style);
        }
        if ctx
            .style
            .and_then(|style| style.position.as_deref())
            .is_none()
        {
            wrapper = wrapper.relative();
        }

        wrapper
            .child(crate::automation::bounds_tracker(self.id))
            .child(WebviewPlaceholder {
                element_id: self.id,
                url: self.url.clone(),
                user_agent: self.user_agent.clone(),
                callback: self.callback.clone(),
            })
            .into_any_element()
    }

    fn set_prop(&mut self, key: &str, value: serde_json::Value) {
        let as_string = |value: serde_json::Value| {
            if value.is_null() {
                None
            } else {
                value.as_str().map(str::to_string)
            }
        };
        match key {
            "url" => self.url = as_string(value),
            "userAgent" => self.user_agent = as_string(value),
            _ => {}
        }
    }

    fn supported_props(&self) -> &[&str] {
        &["url", "userAgent"]
    }

    fn get_prop(&self, key: &str) -> Option<serde_json::Value> {
        match key {
            "url" => self.url.as_ref().map(|u| serde_json::Value::String(u.clone())),
            "userAgent" => self
                .user_agent
                .as_ref()
                .map(|u| serde_json::Value::String(u.clone())),
            _ => None,
        }
    }

    fn supported_events(&self) -> &[&str] {
        &["load", "navigation", "loadError"]
    }

    fn destroy(&mut self) {
        // The only cleanup path that matters: the registry owns the WKWebView,
        // so releasing it here detaches the AppKit view. Reached on unmount via
        // `prune_missing` and on app quit via `destroy_all`.
        crate::native_view::with_registry(|registry| registry.destroy(self.id));
        self.callback = None;
    }
}

pub struct WebviewFactory;

impl CustomElementFactory for WebviewFactory {
    fn element_type(&self) -> &str {
        "webview"
    }

    fn create(&self, id: u64) -> Box<dyn CustomElement> {
        Box::new(WebviewElement::new(id))
    }
}
