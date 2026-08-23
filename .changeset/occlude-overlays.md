---
'@gpuix/native': patch
'@gpuix/react': patch
---

Stop mouse hits from falling through painted overlays.

A filled or absolutely positioned `div` now inserts a blocking hitbox, the same way CSS `pointer-events` works on an opaque surface. Clicks, hovers, and scroll no longer reach controls under a Select, Combobox, or any other card.

Set `pointerEvents: "none"` to opt out. Set `pointerEvents: "auto"` to block even when the element has no fill.
