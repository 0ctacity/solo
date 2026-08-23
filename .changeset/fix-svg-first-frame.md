---
'@gpuix/native': patch
---

Fix `<svg>` icons that stay blank.

Two cases painted nothing: GPUI's async `external_path` cache, and Bun/Vitest `import … with { type: 'file' }` which passes a `data:image/svg+xml,…` URL. `fs::read` cannot open that URL.

`<svg src>` now loads bytes when the prop is set. File paths are read from disk. Data URLs are percent-decoded. The icon paints with `svg().data(...)`.
