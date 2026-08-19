---
'@gpuix/native': patch
---

Implement the clipboard and stop inverting scroll direction in `NodePlatform`.

## Clipboard

`write_to_clipboard` and `read_from_clipboard` were empty stubs, so Cmd+C did nothing. They now use `arboard`. The handle is created lazily and a failure is remembered rather than retried, because construction spawns a background thread on X11.

## Scroll ignored the OS preference

Every wheel delta was negated. The OS has already applied the user's scroll-direction setting: on macOS winit reads `scrollingDeltaX/Y` straight from the NSEvent, which AppKit flips when **natural scrolling** is on, and Zed's own `gpui_macos` backend forwards those values unchanged. Negating them inverted whatever the user chose in System Settings. The delta now passes through with its sign intact.
