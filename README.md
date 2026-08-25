# Solo

Build native GPU-accelerated desktop apps with **Solid** and TypeScript.
Your components render directly to the GPU via Metal, DirectX, or Vulkan —
no Electron, no web views.

```tsx
import { createSignal } from "solid-js"
import { render, View, Text, Button } from "@solo/solid"

function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <View style={{ display: "flex", gap: 12 }}>
      <Text>{count()}</Text>
      <Button onClick={() => setCount((v) => v + 1)}>Increment</Button>
    </View>
  )
}

render(() => <Counter />, { title: "Counter", width: 480, height: 320 })
```

## Architecture

```
TypeScript / TSX
      ↓
    Solid          ← custom renderer (babel-preset-solid, universal mode)
      ↓
@solo/core        ← framework-neutral: mutation protocol types, batching,
      ↓               event registry, automation client, frame loop
@solo/native      ← napi-rs bridge; retained element tree in Rust
      ↓
     GPUI           ← Zed's GPU UI framework (pinned revision)
```

Solo is **description-driven**, not DOM-like. Frameworks never mutate a
retained JS tree: each commit queues a minimal batch of native mutations
(`createElement`, `appendChild`, `setText`, `setStyle`, `setCustomProp`,
`setEventListener`) that is flushed to Rust through a single `applyBatch`
FFI call. GPUI's retained tree owns all real state.

## Packages

| package | role |
|---|---|
| [`@solo/native`](packages/native) | Rust/napi bridge. Retained tree, GPUI element building, text selection, syntax highlighting, markdown, diffs, input editors, automation host, GPU-backed test renderer (macOS). |
| [`@solo/core`](packages/core) | Framework-neutral primitives: protocol/style types, event-handler registry, mutation batching (`wrapWithBatching`), frame loop, automation client/server, mock renderer for tests. |
| [`@solo/solid`](packages/solid) | Solid custom renderer. Maps Solid's universal ops onto the native mutation protocol with fine-grained updates; semantic primitives (`View`, `Text`, `Button`); window `render()`; automation wiring; test harness. |

## Runtime model

- Solid compiles JSX to universal renderer ops (`createElement`,
  `insertNode`, `insert`, `setProp`, …) against `@solo/solid/runtime`.
- Every op maps onto a native mutation and is queued through
  `wrapWithBatching`; exactly one microtask-scheduled `applyBatch` flushes
  per reactive transaction. A signal-driven text change becomes a single
  `setText`.
- Removal is a *detach*: nodes are only destroyed at commit time if they
  were not reattached, so keyed list moves preserve subtrees.
- Native events arrive by element ID on the JS thread and dispatch into a
  shared handler registry (`handleGpuixEvent`).

## Native elements

`div`, `text`, `img`, `svg`, `input`, `textarea`, `anchored`, `code`
(Tree-sitter highlighting), `diff` (unified patches), `markdown`
(GFM), `virtual-list` (windowed rows). Styles are a CSS-like subset
(`StyleDesc`) applied natively, including hover/active pseudo-states,
overflow scrolling, opacity, borders, and text metrics.

## Automation

Solo ships a Playwright-style automation protocol over stdio (SSE
framing). Any app whose stdin is not a TTY serves it automatically:
tree queries by testId/text/type, click/mouse/keyboard/wheel injection,
programmatic scrolling, bounds, screenshots, clock control. The client
lives in `@solo/core/automation`; see `examples/tasks/diagnose-scroll.mts`.

## Testing

- Headless (all platforms): `MockNativeRenderer` records every mutation op
  for protocol-level assertions. See
  `packages/solid/src/__tests__/lifecycle.test.tsx`.
- GPU-backed (macOS): `createSolidNativeTestRoot()` drives real frames,
  hit testing, selection, and screenshots through `TestGpuixRenderer`.

Run tests:

```bash
cd packages/solid && bun run test   # vitest
cd packages/native && cargo test --lib && cargo test --test layout_probe
```

## Examples

| example | demonstrates |
|---|---|
| `examples/tasks` | full task manager: store state, keyed list, scroll, input, automation regression suite |
| `examples/solid-counter` | minimal counter window |

## Build

Requirements: Bun, Rust 1.97.1 (see `rust-toolchain.toml`), plus Xcode's
Metal Toolchain on macOS (`xcodebuild -downloadComponent MetalToolchain`).

```bash
bun install
bun run build:native        # napi release build (~minutes)
cd examples/tasks && bun run build && node dist/index.js
```

GPUI comes from a pinned git revision of `remorses/zed` (branch
`gpui-macos-embedded`); see [docs/gpui-dependency.md](docs/gpui-dependency.md).

## Platform status

| platform | windows | input | notes |
|---|---|---|---|
| macOS | ✅ | ✅ incl. synthetic input & GPU test renderer | embedded AppKit loop driven from Node |
| Linux (Wayland/X11) | ✅ | ✅ physical input; synthetic wheel via automation | blocking UI thread |
| Windows | ✅ builds | ⚠️ untested | same blocking-thread model |

## Acknowledgements

Solo originated as a fork of GPUIX and has since diverged into an independent
Solid-first native TypeScript desktop framework built on GPUI.

Inherited license notices are preserved in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and were not replaced by the
transfer to independent ownership.
