---
'@gpuix/native': patch
'@gpuix/react': patch
---

Make `autoFocus` work and unstyle `<input>`.

## `autoFocus` did nothing, so `<input>` was dead

`autoFocus`, `tabIndex` and `tabStop` were declared in `Props` and dropped by the reconciler before they reached Rust. An `<input>` therefore never held keyboard focus unless the user clicked it, and no key event arrived.

`autoFocus` now works on every element type:

```tsx
<input value={text} autoFocus onKeyDown={(e) => e.keyChar && setText(t => t + e.keyChar)} />
```

`tabIndex` and `tabStop` are **removed** from `Props`. They were no-ops, and a type that promises something the renderer ignores is worse than no type at all.

## `<input>` is unstyled

It hardcoded a `#1e1e2e` background, a `#555555` border and a 4px radius. A primitive cannot impose a look, because no caller can remove it. It now paints no background, no border and no radius; only the placeholder dims. Style the element or its wrapper:

```tsx
<input
  value={text}
  style={{ backgroundColor: '#00000000', borderWidth: 0, color: '#ececec', fontSize: 15 }}
/>
```

Remember that `<input>` is **controlled**: it paints `value` and reports keystrokes, so the app must append `event.keyChar` itself.
