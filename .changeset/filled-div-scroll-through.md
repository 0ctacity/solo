---
'@gpuix/native': patch
'@gpuix/react': patch
---

Let a parent scroller take the wheel over a filled in-flow `div`.

A `backgroundColor` used to insert `occlude()` (BlockMouse). That stopped the hit test, so `<virtual-list>` never saw the wheel when the pointer was over text or a card. Empty padding still scrolled. Content felt stuck or slow.

In-flow fills now use `block_mouse_except_scroll()`. Absolute, fixed, and `pointerEvents: "auto"` still steal the wheel.
