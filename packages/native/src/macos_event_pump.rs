//! Keep the embedded AppKit pump from waiting for a future external event.

use std::ffi::c_void;
use std::ptr;

use napi::{Error, Result};
use objc2_core_foundation::{
    kCFRunLoopCommonModes, CFRetained, CFRunLoop, CFRunLoopActivity, CFRunLoopObserver,
    CFRunLoopObserverContext,
};

struct WakeBeforeWait(CFRetained<CFRunLoopObserver>);

impl Drop for WakeBeforeWait {
    fn drop(&mut self) {
        // Invalidating removes the observer from every mode before releasing it.
        self.0.invalidate();
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
    let observer = unsafe {
        CFRunLoopObserver::new(
            None,
            CFRunLoopActivity::BeforeWaiting.0,
            true,
            isize::MAX,
            Some(wake_before_wait),
            &mut context,
        )
    }
    .ok_or_else(|| Error::from_reason("Failed to create macOS pump wake observer"))?;
    let guard = WakeBeforeWait(observer);
    // SAFETY: Core Foundation's process-lifetime common-modes constant.
    run_loop.add_observer(Some(&guard.0), unsafe { kCFRunLoopCommonModes });
    Ok(platform.pump_events())
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
