---
'@gpuix/native': patch
'@gpuix/react': patch
---

Use GPUI's native platform, window, renderer, and event pipeline in Node applications on macOS, Windows, and Linux.

On macOS, Node drives an embedded AppKit event pump from the pinned GPUIX fork on the process main thread. On Windows and Linux, GPUI runs its normal blocking event loop on a dedicated Rust UI thread while Node sends in-process render and window commands. Windows runtime validation is still pending.
