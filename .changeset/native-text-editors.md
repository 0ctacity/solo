---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add native single-line and multiline text editors backed by GPUI's platform
input handler.

```tsx
<textarea
  value={draft}
  minRows={1}
  maxRows={8}
  onChange={(event) => setDraft(event.value ?? '')}
  onSubmit={send}
/>
```

Both `<input>` and `<textarea>` now support a native caret, mouse selection,
IME composition, clipboard actions, undo/redo, caret movement and grapheme-safe
deletion. `Enter` submits and `Shift+Enter` inserts a newline in a textarea.
