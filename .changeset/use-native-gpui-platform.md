---
'@gpuix/native': patch
---

Use GPUI's native macOS platform, window, Metal renderer, and AppKit event pipeline in Node applications.

The embedded platform pumps AppKit without blocking Node, so live applications now receive the same native mouse, keyboard, scroll, IME, clipboard, display, and window behavior as ordinary Rust GPUI applications. This removes GPUIX's custom platform and window reimplementations.
