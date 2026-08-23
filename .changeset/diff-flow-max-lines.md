---
'@gpuix/native': minor
'@gpuix/react': minor
---

`<diff>` now **flows** with its parent. It no longer owns a scroller unless you pass `scroll`.

Nested scrolling is not supported in GPUI. A transcript that already scrolls used to fight the inner `list()`. The default is now a column of rows, same as `<code>`. The parent is the only scroller.

Use `maxLines` to keep a long patch short. Show more fires `onShowMore` with the hidden line count. Clear `maxLines` in that handler to reveal the rest.

```tsx
const [open, setOpen] = useState(false)

<diff
  patch={unifiedPatch}
  wordDiff
  maxLines={open ? undefined : 24}
  onShowMore={() => setOpen(true)}
/>
```

Pass `scroll` and a bounded height only for a dedicated full-window viewer. That path still virtualizes with GPUI's `list()`.
