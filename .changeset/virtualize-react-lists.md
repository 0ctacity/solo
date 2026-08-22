---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add `<virtual-list>` for long, variable-height React collections. GPUI builds and lays out only rows near the viewport while React and the native retained tree keep the complete collection.

```tsx
<virtual-list
  alignment="bottom"
  followTail
  estimatedItemHeight={180}
  style={{ flexGrow: 1, minHeight: 0 }}
>
  {messages.map((message) => (
    <Message key={message.id} message={message} />
  ))}
</virtual-list>
```

Rows can contain any GPUIX host or custom element. Appended rows preserve list measurements, changed rows are remeasured, and existing `scrollTo`, `scrollToItem`, and `getScrollOffset` methods work with virtual lists.
