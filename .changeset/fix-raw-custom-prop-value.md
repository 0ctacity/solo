---
'@gpuix/native': patch
'@gpuix/react': patch
---

Keep raw custom-prop values intact in `applyBatch`.

`setCustomProp` still treats the payload as a JSON **string**. After the batch
started carrying objects, a raw `"top"` or `"true"` was parsed again and
threw. `<anchored side="top">` never committed.

Queue `setCustomPropValue` for a raw JSON value. File paths, sides, and
booleans stay as they are.

```ts
queue.push(['setCustomPropValue', id, 'side', 'top'])
```
