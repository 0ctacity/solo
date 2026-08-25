---
"@solo/react": major
"@solo/solid": minor
"@solo/core": patch
---

Remove React support; Solid is the supported runtime.

- `@solo/react` is deleted (last published as 0.4.0). The automation
  protocol/client it hosted moved to `@solo/core/automation` — update
  imports and use `@solo/core` as the client dependency.
- `@solo/solid` gains a GPU-backed test harness
  (`@solo/solid/testing`, macOS) plus ported native-input coverage.
- `@solo/core` automation client strings now identify as
  `@solo/core/automation`.
