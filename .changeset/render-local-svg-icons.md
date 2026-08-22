---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add native rendering for tintable SVG icons loaded from local files.

```tsx
<svg
  src="/absolute/path/to/search.svg"
  style={{ width: 16, height: 16, color: '#b4b4b4' }}
/>
```

The element uses GPUI's monochrome SVG renderer. `width` and `height` control
layout, while `color` controls the icon tint.
