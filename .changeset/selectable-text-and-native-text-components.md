---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add selectable text everywhere, plus `<code>`, `<diff>` and `<markdown>` elements with Tree-sitter syntax highlighting.

## Text is selectable and copyable

Every text GPUIX paints can now be selected with a drag and copied with Cmd+C. A drag can start in a plain `<text>` and end inside a code block; the selection spans both.

```tsx
<div style={{ display: 'flex', flexDirection: 'column' }}>
  <text>drag from here</text>
  <code code={'and into this code block'} language="ts" />
</div>
```

Chrome opts out the same way CSS does, and it inherits:

```tsx
<div style={{ userSelect: 'none' }}>
  <text>toolbar label, never selected</text>
</div>
```

Read it from the renderer with `renderer.getSelectedText()` and clear it with `renderer.clearSelection()`. `NodePlatform` now implements the clipboard, so Cmd+C actually writes.

## `<code>`

A syntax-highlighted block. One row per line at an exact line height, so its height is known before highlighting runs and a late highlight never reflows it.

```tsx
<code code={source} language="typescript" showLineNumbers />
<code code={source} path="src/app.ts" />   {/* detect from the extension */}
```

## `<diff>`

A unified diff viewer virtualized with GPUI's `list()`, so a 2000-line patch paints only the rows on screen. Collapsing a file removes its rows rather than hiding them.

```tsx
<diff
  patch={unifiedPatch}
  wordDiff
  collapsedPaths={['pnpm-lock.yaml']}
  onToggleFile={(e) => toggle(e.value)}
  onLineClick={(e) => console.log(e.oldLine, e.newLine, e.value)}
/>
```

`wordDiff` highlights only the tokens that changed inside paired `+`/`-` lines, so a one-character edit is visible at a glance.

## `<markdown>`

GitHub-flavoured markdown: headings, lists, tables, block quotes, fenced code, strikethrough, task lists, and autolinked bare URLs.

```tsx
<markdown source={readme} onLinkClick={(e) => open(e.value)} />
```

## Theming

All three take the same `theme` prop. Fields layer on top of the built-in dark theme, so overriding one token leaves the rest alone.

```tsx
<code
  code={source}
  language="rust"
  theme={{
    appearance: 'light',
    accent: '#7c86ff',
    syntax: { keyword: '#f38ba8', string: '#a6e3a1' },
  }}
/>
```

Bundled languages: Rust, TypeScript, TSX, JavaScript, JSX, Python, Go, JSON, Bash, TOML, YAML, Markdown, HTML, CSS, C.

## Layout numbers are props, not constants

Row heights, gutter widths, paddings and the heading scale live in `theme.metrics`, so tuning the design is a React re-render and never a native rebuild.

```tsx
<diff
  patch={patch}
  theme={{
    metrics: {
      diffLineHeight: 26,
      diffGutterWidth: 48,
      mdHeadingSizes: [24, 19, 16, 14],
    },
  }}
/>
```

`<diff>` derives its virtualized height model from these numbers without measuring, so changing `diffLineHeight` also re-sizes the scroll model.

## New style props

- `userSelect`: `"text"` | `"none"`, inherited
- `selectionColor`: selection wash for a subtree
- `lineHeight` is now applied (it was accepted and ignored before)

## New test helpers

`getAllText()` only sees `<text>` nodes in the retained tree, and native elements paint inside GPUI. Two new helpers close that gap:

```ts
// every string painted in the last frame, in paint order
expect(renderer.getPaintedText()).toEqual(['a', 'b'])

// selection listeners register during paint, so this flushes between steps
expect(renderer.dragSelect(20, 30, 900, 300)).toBe('first line\nsecond line')

// [hits, misses, documents]
const [hits] = renderer.getSyntaxCacheStats()
```

## `<diff>` honours `borderRadius`

GPUI clips a scroll container to its bounds **rectangle**, never to a rounded path, so a rounded wrapper with `overflow: hidden` still shows square corners. `<diff>` echoes its own `borderRadius` onto the first row, which is the only row that paints at the top edge.

Ported from [Comet](https://github.com/zeronsh/comet) (MIT). See `THIRD_PARTY_NOTICES.md`.
