---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add CSS **grid** layout on `div`.

`display: "grid"` plus `gridTemplateColumns` maps to GPUI's Taffy grid. Use `gridColumnMin: "max-content"` for tables so each column is as wide as its widest cell.

```tsx
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 3,
    gridColumnMin: 'max-content',
    rowGap: 1,
    columnGap: 1,
  }}
>
  {cells}
</div>
```

`gridTemplateRows` and `gridRowMin` work the same on the other axis.
