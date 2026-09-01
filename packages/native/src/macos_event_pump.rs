//! Keep the embedded AppKit pump from waiting for a future external event.

use std::ffi::c_void;
use std::ptr;

use napi::{Error, Result};
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSApplication, NSEvent, NSEventModifierFlags, NSEventSubtype, NSEventType,
    NSModalPanelRunLoopMode,
};
use objc2_core_foundation::{
    kCFRunLoopCommonModes, CFRetained, CFRunLoop, CFRunLoopActivity, CFRunLoopMode,
    CFRunLoopObserver, CFRunLoopObserverContext,
};
use objc2_foundation::NSPoint;

struct PumpObservers {
    wake: CFRetained<CFRunLoopObserver>,
    modal_stop: CFRetained<CFRunLoopObserver>,
}

impl Drop for PumpObservers {
    fn drop(&mut self) {
        for observer in [&self.wake, &self.modal_stop] {
            // Invalidating removes the observer from every mode before release.
            observer.invalidate();
        }
    }
}

pub(crate) fn pump_events(platform: &gpui_macos::MacPlatform) -> Result<bool> {
    let run_loop = CFRunLoop::main()
        .ok_or_else(|| Error::from_reason("macOS main run loop is unavailable"))?;
    let mut context = CFRunLoopObserverContext {
        version: 0,
        info: ptr::null_mut(),
        retain: None,
        release: None,
        copyDescription: None,
    };
    // GPUI stops NSApplication.run from an AfterWaiting observer. Its pre-posted
    // NSEvent can be drained before CFRunLoop sleeps, leaving no source to wake
    // it again. Queue the wake at the sleep boundary instead. Do not stop here:
    // the after-wake phase must still service GPUI's main-queue frame callbacks.
    // SAFETY: the callback owns no context and is registered only on the main
    // run loop; the guard invalidates it before this synchronous pump returns.
    let wake_observer = new_observer(
        CFRunLoopActivity::BeforeWaiting,
        isize::MAX,
        wake_before_wait,
        &mut context,
    )?;
    let modal_stop_observer = new_observer(
        CFRunLoopActivity::AfterWaiting,
        isize::MIN,
        stop_modal_run,
        &mut context,
    )?;
    let guard = PumpObservers {
        wake: wake_observer,
        modal_stop: modal_stop_observer,
    };
    // SAFETY: Core Foundation's process-lifetime common-modes constant.
    run_loop.add_observer(Some(&guard.wake), unsafe { kCFRunLoopCommonModes });
    // NSOpenPanel/NSSavePanel may drive NSApplication.run in a modal mode,
    // which is not guaranteed to be a common mode. Wake that mode and mirror
    // GPUI's AfterWaiting stop so tick() still returns to Bun while a panel is
    // open. NSString/CFString are toll-free bridged by objc2-foundation.
    let modal_mode: &CFRunLoopMode = unsafe { NSModalPanelRunLoopMode }.as_ref();
    run_loop.add_observer(Some(&guard.wake), Some(modal_mode));
    run_loop.add_observer(Some(&guard.modal_stop), Some(modal_mode));
    Ok(platform.pump_events())
}

fn new_observer(
    activity: CFRunLoopActivity,
    order: isize,
    callback: unsafe extern "C-unwind" fn(*mut CFRunLoopObserver, CFRunLoopActivity, *mut c_void),
    context: &mut CFRunLoopObserverContext,
) -> Result<CFRetained<CFRunLoopObserver>> {
    // SAFETY: callbacks own no context and the returned guard invalidates each
    // observer before this synchronous pump call returns.
    unsafe { CFRunLoopObserver::new(None, activity.0, true, order, Some(callback), context) }
        .ok_or_else(|| Error::from_reason("Failed to create macOS pump observer"))
}

unsafe extern "C-unwind" fn wake_before_wait(
    _: *mut CFRunLoopObserver,
    _: CFRunLoopActivity,
    _: *mut c_void,
) {
    if let Some(run_loop) = CFRunLoop::main() {
        run_loop.wake_up();
    }
}

unsafe extern "C-unwind" fn stop_modal_run(
    _: *mut CFRunLoopObserver,
    _: CFRunLoopActivity,
    _: *mut c_void,
) {
    // SAFETY: CFRunLoop invokes this observer only on the registered main loop.
    let marker = unsafe { MainThreadMarker::new_unchecked() };
    let app = NSApplication::sharedApplication(marker);
    app.stop(None);
    // NSApplication only observes stop after receiving another event. Mirror
    // GPUI's embedded-loop stop helper so an idle modal panel cannot strand
    // tick() after this observer fires.
    if let Some(event) = NSEvent::otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2(
        NSEventType::ApplicationDefined,
        NSPoint::new(0.0, 0.0),
        NSEventModifierFlags::empty(),
        0.0,
        0,
        None,
        NSEventSubtype::WindowExposed.0,
        0,
        0,
    ) {
        app.postEvent_atStart(&event, true);
    }
}
