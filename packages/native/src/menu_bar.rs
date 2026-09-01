//! macOS status item for opt-in background applications.

use napi::bindgen_prelude::{Error, Result};
use objc2::rc::Retained;
use objc2::{define_class, msg_send, sel, AnyThread, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSImage, NSMenu, NSMenuItem, NSStatusBar, NSStatusItem, NSVariableStatusItemLength,
};
use objc2_foundation::{NSObject, NSObjectProtocol, NSString};

struct TargetIvars;

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and the class owns no
    // resources. AppKit invokes menu actions on the main thread.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = TargetIvars]
    struct SoloMenuBarTarget;

    unsafe impl NSObjectProtocol for SoloMenuBarTarget {}

    impl SoloMenuBarTarget {
        #[unsafe(method(openWindow:))]
        fn open_window(&self, _sender: &NSMenuItem) {
            if let Err(error) = crate::renderer::show_macos_window() {
                log::error!("Failed to show the Solo window: {error}");
            }
        }

        #[unsafe(method(quitApplication:))]
        fn quit_application(&self, _sender: &NSMenuItem) {
            if let Err(error) = crate::renderer::quit_macos_application() {
                log::error!("Failed to quit the Solo application: {error}");
            }
        }
    }
);

impl SoloMenuBarTarget {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(TargetIvars);
        unsafe { msg_send![super(this), init] }
    }
}

/// Owns every weakly referenced AppKit object for one status item.
pub(crate) struct MenuBar {
    status_bar: Retained<NSStatusBar>,
    status_item: Retained<NSStatusItem>,
    _target: Retained<SoloMenuBarTarget>,
}

impl MenuBar {
    pub(crate) fn new(
        options: &crate::renderer::MenuBarOptions,
        application_title: &str,
    ) -> Result<Self> {
        let mtm = MainThreadMarker::new().ok_or_else(|| {
            Error::from_reason("Menu-bar items must be created on the main thread")
        })?;
        let image_path = NSString::from_str(&options.icon_path);
        let image =
            NSImage::initWithContentsOfFile(NSImage::alloc(), &image_path).ok_or_else(|| {
                Error::from_reason(format!(
                    "Failed to load menu-bar icon at {:?}",
                    options.icon_path
                ))
            })?;
        image.setTemplate(true);

        let status_bar = NSStatusBar::systemStatusBar();
        let status_item = status_bar.statusItemWithLength(NSVariableStatusItemLength);
        let button = status_item
            .button(mtm)
            .ok_or_else(|| Error::from_reason("macOS did not create a menu-bar button"))?;
        button.setImage(Some(&image));
        if let Some(tooltip) = options.tooltip.as_deref() {
            button.setToolTip(Some(&NSString::from_str(tooltip)));
        }

        let target = SoloMenuBarTarget::new(mtm);
        let menu =
            NSMenu::initWithTitle(NSMenu::alloc(mtm), &NSString::from_str(application_title));
        let empty = NSString::from_str("");
        let open = unsafe {
            NSMenuItem::initWithTitle_action_keyEquivalent(
                NSMenuItem::alloc(mtm),
                &NSString::from_str(&format!("Open {application_title}")),
                Some(sel!(openWindow:)),
                &empty,
            )
        };
        unsafe { open.setTarget(Some(&target)) };
        menu.addItem(&open);
        menu.addItem(&NSMenuItem::separatorItem(mtm));
        let quit = unsafe {
            NSMenuItem::initWithTitle_action_keyEquivalent(
                NSMenuItem::alloc(mtm),
                &NSString::from_str(&format!("Quit {application_title}")),
                Some(sel!(quitApplication:)),
                &empty,
            )
        };
        unsafe { quit.setTarget(Some(&target)) };
        menu.addItem(&quit);
        status_item.setMenu(Some(&menu));

        Ok(Self {
            status_bar,
            status_item,
            _target: target,
        })
    }

    pub(crate) fn remove(self) {
        self.status_item.setMenu(None);
        self.status_bar.removeStatusItem(&self.status_item);
    }
}
