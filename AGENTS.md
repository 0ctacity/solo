# AGENTS.md — Solo Codebase Guide

Solo builds native GPU-accelerated desktop apps from **TypeScript/Solid**
over [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui)
(Zed's rendering framework). Solid is the only supported frontend runtime.

```
TypeScript / TSX
      ↓
    Solid          ← custom renderer (babel-preset-solid, universal mode)
      ↓
@solo/core        ← framework-neutral primitives
      ↓
@solo/native      ← napi-rs bridge, retained tree in Rust
      ↓
     GPUI
```

## Package roles

- **`packages/native`** (`@solo/native`): Rust + napi-rs. Owns the retained
  element tree (`RetainedTree`), GPUI element building (`build_element`,
  `apply_styles`), text selection registry, Tree-sitter syntax
  highlighting, markdown/diff rendering, native input editors, motion,
  automation host + GPU-backed test renderer (macOS), and the frame clock.
- **`packages/core`** (`@solo/core`): framework-neutral TypeScript. The
  mutation protocol vocabulary (`StyleDesc`, `NativeRenderer`), event-handler
  registry, `wrapWithBatching` (queues ops → one `applyBatch` FFI call),
  frame loop, event-prop mapping, `MockNativeRenderer`, and the automation
  client/protocol (`@solo/core/automation`). Must never depend on a UI
  framework.
- **`packages/solid`** (`@solo/solid`): Solid custom renderer. `src/runtime.ts`
  is the `moduleName` target for babel-preset-solid (`generate: "universal"`);
  every op maps onto a native mutation. Ships `View`/`Text`/`Button`
  primitives, window `render()`, automation wiring, `@solo/solid/testing`
  harness, and a types-only jsx-runtime.
- React support was removed; see git history.
- Naming: packages/product are `@solo/*` / Solo; the Rust crate
  (`gpuix-native`), napi binary name and internal symbols like `GpuixView`
  still carry legacy names — renaming them is internal-only churn,
  tracked as follow-up.

## Runtime & mutation model

Description-driven, like GPUI itself:

```
signal write → Solid effects → runtime ops → batching queue
    → microtask flush → applyBatch(json) → RetainedTree → cx.notify → paint
```

- Ops: `createElement`, `appendChild`, `insertBefore`, `removeChild`,
  `setText`, `setStyle`, `setEventListener`, `setCustomProp`,
  `destroyElement`. One `applyBatch` per reactive transaction (microtask).
- Queue raw style/prop objects — do not pre-stringify (double-parse cost).
- Removal detaches; still-detached nodes are destroyed at commit so keyed
  moves can re-insert subtrees within one batch.
- Fine-grained property: one signal write must produce exactly the affected
  op(s) (e.g. one `setText`), never a tree rebuild.

## Layout invariants

- gpui's default `display` is Block. Any element using flexDirection/
  flexGrow MUST set `display: "flex"` explicitly (Solid users: put it in
  style). build_div forces it nowhere else.
- Scroll containers get `min-height: 0` (both axes when both scroll) so
  Taffy's automatic minimum size doesn't pin them to content height.
- The retained-tree root div is created unstyled by JS; build_div gives it
  `size_full()` so percentage heights resolve against the window.
- Nested scrolling is unsupported: one scroll parent, inner content grows
  or collapses behind an expandable.
- Every `overflow-x: scroll` uses `restrict_scroll_to_axis()` so vertical
  wheels are not remapped horizontally.
- Filled in-flow children use `block_mouse_except_scroll`; plain `occlude`
  is only for absolute/fixed overlays.

## Text

All painted strings route through `crate::text` (`selectable_text` /
`chrome_text`) so selection and test assertions can see them. Never
`div().child(string)` in new elements.

## Automation

Apps serve a Playwright-style protocol over stdio whenever stdin is not a
TTY (`serveAutomationStdio`). Methods cover tree lookup (testId/text/type),
click/mouse/keyboard/wheel injection, programmatic scrolling, bounds,
screenshots, and clock control. Client lives in `@solo/core/automation`;
see `examples/tasks/diagnose-scroll.mts`.

## Testing

- Headless everywhere: `MockNativeRenderer` records each mutation op —
  assert protocol traffic directly (`lifecycle.test.tsx`).
- macOS GPU-backed: `createSolidNativeTestRoot()` from `@solo/solid/testing`
  (mirrors the old React harness). Gate with `hasNativeTestRenderer`.
- Layout ground-truth: `packages/native/tests/layout_probe.rs` draws the
  real builder chain headlessly and asserts ScrollHandle geometry.
- Run: `bun run test` inside packages/solid|core|react-less workspaces;
  `cargo test --lib --test layout_probe` in packages/native. Use `bun run
  test`, not `bun test` (vitest).

## Native layout gotchas (each cost us a bug)

- Percentage heights need a *definite* parent height chain up to the window;
  build_div sizes the retained root for this.
- Flex items cannot shrink below content without explicit min-size 0.
- `.on_scroll_wheel` listeners see every wheel event in the window — always
  position-check before consuming/stopping propagation.

## Iterating on the Rust side

No hot reload: `require()` of a `.node` dlopens permanently; the UI thread,
GPU device and registries live in its thread-locals. Use
`bun scripts/dev.ts` to rebuild and rerun screenshot tests (~4 s to fresh
PNGs on macOS). After a native rebuild restart the app.

Cargo treats git-checkout dependencies as immutable — after editing a
checked-out crate (e.g. temporary gpui tracing) clear
`target/release/.fingerprint/<crate>-*` or nothing rebuilds.

## GPUI dependency

Pinned git revision of `remorses/zed` (branch `gpui-macos-embedded`),
same rev for `gpui`, `gpui_platform`, `gpui_macos`. The fork exists only
for the embedded macOS event loop. See docs/gpui-dependency.md.
`rust-toolchain.toml` must match the revision's channel.

## Auto-generated files

Never edit by hand (regenerated by napi builds):
`packages/native/index.d.ts`, `index.js`, `*.node`. Note: Linux/macOS
builds generate different declarations (TestGpuixRenderer is
macOS-gated); restore them with `git checkout` if a local Linux build
rewrites them.

## Releasing

There is no automated release path: CI builds and tests only, and the
packages are not published anywhere. Every `packages/*/package.json`
carries a `prepublishOnly` guard that aborts a local `npm publish`, so
releasing takes a deliberate decision rather than an accidental version
bump. When publishing returns, stand up a versioning workflow
(changesets or equivalent) in the same change — `CHANGELOG.md` is
frozen at 0.4.0 and still documents the removed `@solo/react`
package.

## Examples

- `examples/tasks` — dogfood task manager: store state, keyed list,
  scrolling, input composer, automation regression suite, diagnose driver.
- `examples/solid-counter` — minimal counter window.

## Contributing

1. Rust changes: `packages/native/src/`.
2. TS changes: `packages/core` (neutral) or `packages/solid` (renderer).
3. Keep `@solo/core` free of framework imports.
