---
"@gpuix/react": major
"@gpuix/solid": minor
"@gpuix/core": patch
---

Remove React support; Solid is the supported runtime.

- `@gpuix/react` is deleted (last published as 0.4.0). The automation
  protocol/client it hosted moved to `@gpuix/core/automation` — update
  imports and use `@gpuix/core` as the client dependency.
- `@gpuix/solid` gains a GPU-backed test harness
  (`@gpuix/solid/testing`, macOS) plus ported native-input coverage.
- `@gpuix/core` automation client strings now identify as
  `@gpuix/core/automation`.
