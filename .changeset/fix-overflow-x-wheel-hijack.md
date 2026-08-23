---
'@gpuix/native': patch
'@gpuix/react': patch
---

Stop a vertical wheel over `overflowX: "scroll"` from scrolling that child sideways.

GPUI remaps mouse-wheel Y onto overflow-x unless `restrict_scroll_to_axis` is set. A transcript that contains `<code>` or a markdown table then jumps on both axes.

A vertical wheel now stays on the parent scroller. Trackpad X still pans the wide child.

```tsx
<div style={{ overflowY: "scroll" }}>
  <code code={wideSource} language="ts" />
</div>
```
