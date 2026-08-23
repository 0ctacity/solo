---
'@gpuix/native': patch
'@gpuix/react': patch
---

Speed up the first React mount by sending styles and custom props as JSON values instead of double-encoded strings.

`applyBatch` used to stringify every `setStyle` and `setCustomProp` payload, then stringify the whole queue. Rust parsed the outer array and then parsed each escaped string again. A 10,000-row list spent most of its mount time there.

The batch now carries objects once. Legacy string payloads still decode.

```ts
render(<App />, { title: 'My App' })
```
