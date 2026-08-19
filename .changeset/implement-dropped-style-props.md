---
'@gpuix/native': patch
---

Implement six style props that were declared in the public type and silently dropped.

## `<text>` ignored every layout style

`<text>` applied a text-only subset of the style set, so `padding`, `width`, `backgroundColor`, `borderRadius` and every flex prop on a text node were dropped without a warning. It now takes the full style set, exactly like `<div>`.

```tsx
<text style={{ paddingLeft: 40, width: 300, backgroundColor: '#7c86ff', borderRadius: 12 }}>
  now works
</text>
```

## The rest

- **`fontSize`** lived only in the text path, so setting it on a `<div>` or a custom element did nothing.
- **`textAlign`** was in `StyleDesc` and implemented nowhere.
- **`rowGap`** and **`columnGap`** were in `StyleDesc` and implemented nowhere; only `gap` worked.
- **`lineHeight`** was accepted and ignored, so multi-line text always used gpui's default leading.
- **`borderWidth: 0`** was skipped by a `> 0.0` guard, so an element that drew its own border could never have it cleared by the caller.

Each now has a screenshot regression test in `style-coverage.test.tsx`.
