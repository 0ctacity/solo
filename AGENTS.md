# AGENTS.md - GPUIX Codebase Guide

**Read [README.md](./README.md) first** to understand what GPUIX is, the architecture, mutation API, event flow, supported elements/events/styles, and the test renderer.

## Project Goal

GPUIX enables building **native GPU-accelerated desktop applications** using **React and TypeScript**, powered by [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) (Zed's rendering framework).

Instead of Electron/web rendering, your React components render directly to the GPU via Metal/Vulkan.

```
React (TypeScript)  →  napi-rs  →  GPUI (Rust)  →  GPU
     Your code         Bridge      Native render    Metal/Vulkan
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  JavaScript / TypeScript                                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Your React App                                          │   │
│  │                                                          │   │
│  │  function App() {                                        │   │
│  │    const [count, setCount] = useState(0)                 │   │
│  │    return (                                              │   │
│  │      <div style={{ display: 'flex', bg: '#1e1e2e' }}>    │   │
│  │        <div onClick={() => setCount(c => c + 1)}>+</div> │   │
│  │      </div>                                              │   │
│  │    )                                                     │   │
│  │  }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  @gpuix/react (packages/react)                           │   │
│  │                                                          │   │
│  │  - React Reconciler (react-reconciler)                   │   │
│  │  - Builds element tree from React components             │   │
│  │  - Serializes to JSON ElementDesc                        │   │
│  │  - Manages event handler registry                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓ JSON                             │
└─────────────────────────────────────────────────────────────────┘
                               ↓ napi-rs FFI
┌─────────────────────────────────────────────────────────────────┐
│  Rust / Native                                                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  @gpuix/native (packages/native)                         │   │
│  │                                                          │   │
│  │  - GpuixRenderer: receives JSON, triggers re-render      │   │
│  │  - build_element(): ElementDesc → GPUI elements          │   │
│  │  - apply_styles(): StyleDesc → GPUI style methods        │   │
│  │  - Event handlers → ThreadsafeFunction callbacks to JS   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  GPUI (from zed)                                         │   │
│  │                                                          │   │
│  │  - Immediate-mode UI framework                           │   │
│  │  - Flexbox layout via Taffy                              │   │
│  │  - GPU rendering via Metal (macOS) / Vulkan (Linux)      │   │
│  │  - Native window management                              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Insight: Immediate Mode Alignment

GPUI is **immediate-mode** - it rebuilds the entire UI tree every frame. This actually aligns perfectly with React's model:

| Traditional DOM Renderer | GPUIX |
|--------------------------|-------|
| `appendChild(node)` | Rebuild tree each render |
| `node.style.color = x` | Send full tree description |
| Mutation-based | Description-based |

We don't fight GPUI's architecture - we embrace it by sending a complete element description on every React render.

## Package Structure

```
gpuix/
├── packages/
│   ├── native/                 # Rust napi-rs bindings
│   │   ├── src/
│   │   │   ├── lib.rs          # Module exports
│   │   │   ├── renderer.rs     # GpuixRenderer, GpuixView, build_element()
│   │   │   ├── element_tree.rs # ElementDesc, EventPayload types
│   │   │   ├── style.rs        # StyleDesc, color parsing
│   │   │   ├── theme.rs        # Comet palette, oklch helpers, JS overrides
│   │   │   ├── text/           # Selection: state, paint registry, TextRuns
│   │   │   ├── syntax/         # Tree-sitter highlighting + bounded cache
│   │   │   ├── markdown/       # pulldown-cmark parser + gpui renderer
│   │   │   ├── diff/           # Unified-patch parser + row flattening
│   │   │   └── custom_elements/# input, img, svg, anchored, code, diff, markdown
│   │   ├── examples/
│   │   │   └── hello.rs        # Pure GPUI test (no JS)
│   │   ├── Cargo.toml
│   │   └── build.rs
│   │
│   └── react/                  # React reconciler
│       ├── src/
│       │   ├── index.ts        # Public exports
│       │   ├── reconciler/
│       │   │   ├── host-config.ts  # React reconciler implementation
│       │   │   ├── reconciler.ts   # ReactReconciler instance
│       │   │   └── renderer.ts     # createRoot(), event bridge
│       │   ├── hooks/
│       │   │   ├── use-gpuix.ts    # Context access
│       │   │   └── use-window-size.ts
│       │   └── types/
│       │       └── host.ts     # TypeScript types
│       └── package.json
│
├── examples/
│   ├── package.json            # Workspace package for examples
│   └── counter.tsx             # Example React app
│
└── AGENTS.md                   # This file
```

## Text rendering: one funnel, no exceptions

Every string GPUIX paints goes through `crate::text`:

- `selectable_text(..)` for content — registers into the per-frame selection
  registry and installs the window mouse and key listeners
- `chrome_text(..)` for line numbers, language tags and file headers — painted
  and logged for tests, but never part of a selection

**Never call `div().child(some_string)` in a new element.** Doing so makes the
text invisible to selection AND to `getPaintedText()`, so it cannot be tested
except by screenshot.

The registry is rebuilt during **paint**, not during build, because paint order
is the only place document order is guaranteed: a `list()` decides at paint time
which rows exist. `selection_frame_reset()` must stay the first child of the
root, or stale entries from the previous frame leak into the next drag.

## Layout numbers live in `Theme::metrics`, not in Rust constants

Row heights, gutter widths, paddings, text sizes and the heading scale are all
fields on `crate::theme::Metrics`, reachable from JS as `theme.metrics`.

**Do not add a new `const` for anything that decides layout.** Put it on
`Metrics`, give it a default, add it to `MetricsOverride`, `hash_into`, and the
`GpuixMetrics` TypeScript interface. The whole point is that a design tweak is a
React re-render, not a native rebuild.

Two things stay constant, because they are paint geometry and cannot move a
glyph: the table hairline, and the inline-code wash overhang.

`<diff>` derives its virtualized height model from the metrics without
measuring, so `DiffElement` re-runs `reset_with_uniform_height` whenever
`Metrics::hash_into` changes. Forget that and the scrollbar drifts from the
content.

## Iterating on the Rust side

There is no hot reload and there cannot be: `require()` of a `.node` calls
`process.dlopen`, Node has no unload, and the event loop, GPU device, window and
selection registry all live in thread-locals of the loaded library.

Use `bun run dev` (see `scripts/dev.ts`). It watches `packages/native/src`,
rebuilds, and re-renders the screenshot tests. **A Rust edit reaches fresh PNGs
in about 4 seconds.** Prefer screenshot mode over `--app`: PNGs in
`packages/react/screenshots/` can be read by an agent, a live window cannot.

## Virtualized React children re-enter through `cx.processor`

`<virtual-list>` does not build its retained children during `GpuixView::render`.
Its `gpui::list()` callback uses `cx.processor` to re-enter the `GpuixView`
entity after the root render has returned, creates a fresh `BuildCtx`, and builds
only the rows GPUI requests. Never capture the root render's tree guard or
`BuildCtx` in that callback.

`<diff>` still owns its parsed Rust data because one native diff node is much
cheaper than retaining one React node per line.

## Nested scrolling is not supported

Never put a scroll container inside another scroll container. That includes
`overflow: "scroll"`, `<virtual-list>`, and `<diff>` (`gpui::list()` always
takes the wheel). GPUI delivers the same wheel event to both hitboxes. The
inner list steals the gesture. Nested scroll looks broken and there is no
GPUI API to turn list scroll off.

Keep **one** scroll parent. Long inner content must grow with that parent, or
collapse behind an expandable (file header, first N lines, Show more). `<diff>`
defaults to flow layout. Pass `scroll` plus a bounded height only for a
dedicated viewer. Do not give `<diff>` a bounded height inside a parent
scroller just so it can virtualize.

`overflow-x: scroll` is allowed inside a vertical scroller. GPUI remaps a
vertical wheel onto overflow-x unless `restrict_scroll_to_axis()` is set.
Every `overflow_x_scroll()` in native code must call that, or the parent
scroller jumps sideways when the pointer is over `<code>` or a markdown table.

## Scroll cost

A wheel event calls `cx.notify` on the one `GpuixView`. That rebuilds the
tree. `gpui::list()` then re-renders every **visible** item. Cached heights
only skip overdraw items that are off screen.

```
wheel  ►  notify GpuixView  ►  render()  ►  Taffy on visible rows  ►  paint
```

If scroll is smooth on empty padding and slow or stuck on text, a filled
child is stealing the wheel. `occlude()` is **BlockMouse**. It stops the
hit test. The parent list never sees the event. In-flow fills must use
`block_mouse_except_scroll()`. Keep `occlude()` for absolute/fixed overlays
and `pointerEvents: "auto"`.

The chat "jank" over code and tables was the Y-to-X remap above, not the
tick loop. After that fix, remaining cost is Taffy on fat visible rows.
`<code>` is one flex row per line. Safe-mdx is ~100 host nodes. Flatten
paint before changing the frame loop.

Keep `<virtual-list>` `overdraw` modest. 820px on a short chat kept almost
every row live. Profile with `debugFrameOverlay: 'full'`. The overlay is
draw time, not FPS. `8.3 MS` is about 120 Hz.

A long list is slow **only at start** when React maps every row. `createInstance`
runs in the render phase. 10k rows become ~30k host nodes (row wrapper +
inner + `<markdown>`/`<code>`/`<diff>`), then one `commitMutations`. GPUI does
not build those rows yet. After that, scroll cost is visible Taffy only.

## Profiling and optimizing

Load the **profano** skill first. Fetch its README. Do not guess CLI flags.

Separate **first mount** from **scroll**. They are different paths.

```
first mount
  React maps every child
    ►  createInstance / setStyle / setCustomProp  (queued)
    ►  one applyBatch JSON
    ►  Rust RetainedTree
    ►  first paint (list builds visible rows only)

scroll
  wheel  ►  notify GpuixView  ►  render()  ►  Taffy on visible rows  ►  paint
```

### JS / mount

Write a short script that mounts through `createTestRoot()` and exits. Profile
that, not the live window. The tick loop will drown the mount.

```ts
import React from 'react'
import { createTestRoot } from '@gpuix/react'
import { ChatApp } from './chat'

const root = createTestRoot()
const start = performance.now()
root.render(<ChatApp turnCount={10_000} />)
console.log(`mount ${(performance.now() - start).toFixed(1)}ms`)
```

```bash
cd examples
bun --cpu-prof --cpu-prof-dir=../tmp/cpu-profiles profile-chat-mount.tsx
npx profano ../tmp/cpu-profiles/CPU.*.cpuprofile -n 30
npx profano ../tmp/cpu-profiles/CPU.*.cpuprofile --sort total -n 20
```

Read **self** first. That is where the CPU sat. **Total** is the caller chain.

The 10k chat mount was 850ms. profano said:

| Function | Self | What it was |
|---|---|---|
| `applyBatch` | 626ms | Rust parsing the mutation JSON |
| `FiberNode` | 31ms | React |
| `stringify` | 26ms | `JSON.stringify(queue)` |

React was not the problem. The batch **stringified every style and theme**, then
stringified the queue, then Rust parsed each escaped string again.

Queue **raw objects**. Opcode `setCustomPropValue` carries a raw JSON value.
`setCustomProp` still means a JSON **string** (legacy). A raw `"top"` or
`"true"` on `setCustomProp` is parsed as JSON and throws. That is why the
composer Selects died after the first applyBatch change: `<anchored side="top">`
never committed.

```ts
queue.push(['setStyle', id, styleObject])
queue.push(['setCustomPropValue', id, 'side', 'top'])
```

After a JS reconciler change, **build `@gpuix/react`**. `examples/` and
`bun --hot chat.tsx` load `packages/react/dist`, not `src`. packages/react
vitest uses `src`. You will think the fix works in one suite and fail in the
app.

```bash
cd packages/react && bun run build
```

### Scroll / paint

Turn on `debugFrameOverlay: 'full'`. The number is **draw time**, not FPS.
`8.3 MS` is about 120 Hz.

The chat wheel jank was **not** the tick loop. GPUI remaps a vertical wheel
onto `overflow-x`. `<code>` and markdown tables stole the gesture. Fix is
`restrict_scroll_to_axis()` on every `overflow_x_scroll()`.

Keep `overdraw` modest. 820px on a short list keeps almost every row live.

Do not flatten the frame loop to hide fat rows. Flatten the rows
(`<markdown>` / `<code>` / `<diff>` as one native node).

### Native

For Rust time, `sample` the bun/node pid, or `samply`. GPUI also has
`ZED_MEASUREMENTS=1`. That is Zed's frame log, not our overlay.

A `.node` cannot unload. After a native rebuild, restart the app. `bun --hot`
only remounts React.

## Overlays and icons

Menus, tooltips, and dialogs go through **`SelectContent` / `ComboboxContent` /
`<anchored deferred>`**. Never overflow a `position: "absolute"` card out of the
composer into a `<virtual-list>`. The list paints after the composer, so the
list shows through the menu and clicks hit the text behind it.

Do not paint `#00000000` over a blurred window. A transparent GPUI quad punches
through Metal to the desktop. Omit the fill, or use the parent color. Overlay
rows need a **solid** fill too, not a transparent idle state.

A filled in-flow `div` uses **BlockMouseExceptScroll**. Clicks and hovers stop.
The parent scroller still gets the wheel. `position: "absolute"` / `"fixed"`
or `pointerEvents: "auto"` uses **BlockMouse** and steals the wheel too.
`pointerEvents: "none"` opts out.

Text **selection** still uses window mouse events and text bounds, not hitboxes.
A drag on a menu over markdown can still start a selection. Do not skip
selection tests to hide that.

If `<svg>` icons are blank in vitest, `src` is probably a `data:image/svg+xml`
URL from `import … with { type: 'file' }`. Native decodes that URL. Do not write
a temp-file workaround. Prefer `fill="#000"` / `stroke="#000"` plus
`style.color`. `currentColor` in the file is not `style.color`.

macOS traffic-light clearance is **86px**. The test renderer does not draw
traffic lights, so that gap looks empty in PNGs.

## Ported code

`text/`, `syntax/`, `markdown/`, `diff/`, `theme.rs`, `custom_elements/code.rs`,
`custom_elements/diff.rs`, and the caret blink sections of
`custom_elements/input.rs` are ported from [Comet](https://github.com/zeronsh/comet)
(MIT). Each file names its original in
its header, and `THIRD_PARTY_NOTICES.md` has the full table. When fixing a bug in
one of them, read the Comet original first: it usually documents why the code is
shaped that way.

## Auto-generated files (do NOT edit manually)

The following files in `packages/native/` are auto-generated by napi-rs during `bun run build`. Never edit them by hand — they are regenerated from the Rust `#[napi]` annotations every build:

- `packages/native/index.d.ts` — TypeScript type declarations
- `packages/native/index.js` — Node.js loader/binding glue
- `packages/native/*.node` — compiled native binary

To update the TypeScript API surface, edit the Rust source files in `packages/native/src/` (add/modify `#[napi]` structs, methods, functions), then run `bun run build` in `packages/native` to regenerate.

## Changesets

After completing a fix or feature, add a `.changeset/*.md` file at the repo root instead of editing CHANGELOG.md. Never edit CHANGELOG.md directly; it is generated at publish time. Never bump `package.json` version manually. Load the `changesets` skill for format and rules.

## Publishing

**Never publish from a local machine.** CI is the only release path.

`.github/workflows/ci.yml` builds `@gpuix/native` for every napi target (macOS arm64/x64, Linux x64/arm64, Windows x64/arm64), uploads the `.node` artifacts, then the `publish` job downloads them, runs `napi create-npm-dirs` + `napi artifacts`, and publishes `@gpuix/native` and `@gpuix/react`.

Publish order is required. `@gpuix/react` depends on `@gpuix/native` (`workspace:^`). If React publishes first, an install in that window cannot resolve native.

1. `napi pre-publish` publishes the per-platform packages (`darwin-arm64`, `linux-x64-gnu`, …)
2. `npm publish` publishes `@gpuix/native`
3. `npm publish` publishes `@gpuix/react`

A local `npm publish` / `bun publish` would ship only the host binary and break every other platform. `prepublishOnly` exits if `CI` is unset.

To release: bump versions via changesets, push to `main`. The publish job skips versions already on npm.

## Communication Flow

### Render Flow (JS → Rust)

```
1. React state changes
         ↓
2. React reconciler builds Instance tree
         ↓
3. instanceToElementDesc() converts to JSON-serializable format:
   {
     type: "div",
     id: "btn-1", 
     style: { display: "flex", backgroundColor: "#ff0000" },
     events: ["click", "mouseEnter"],
     children: [...]
   }
         ↓
4. renderer.render(JSON.stringify(tree))
         ↓
5. Rust parses JSON into ElementDesc structs
         ↓
6. build_element() recursively builds GPUI elements:
   div().id("btn-1").flex().bg(rgba(0xff0000ff)).on_click(...)
         ↓
7. GPUI renders to GPU
```

### Event Flow (Rust → JS)

```
1. User clicks element with id="btn-1"
         ↓
2. GPUI fires click event on element
         ↓
3. Rust closure calls emit_event("btn-1", "click", position)
         ↓
4. ThreadsafeFunction calls into JS with EventPayload
         ↓
5. JS event registry looks up handler:
   eventHandlers.get("btn-1")?.click?.(event)
         ↓
6. React handler runs: onClick={() => setCount(c => c + 1)}
         ↓
7. State update triggers re-render → back to Render Flow
```

## Key Types

### ElementDesc (Rust ↔ JS)

```rust
pub struct ElementDesc {
    pub element_type: String,      // "div", "text", "img"
    pub id: Option<String>,        // For event handling
    pub style: Option<StyleDesc>,  // CSS-like styles
    pub content: Option<String>,   // Text content
    pub events: Option<Vec<String>>, // ["click", "mouseEnter"]
    pub children: Option<Vec<ElementDesc>>,
}
```

### StyleDesc (CSS-like properties)

```rust
pub struct StyleDesc {
    // Flexbox
    pub display: Option<String>,        // "flex"
    pub flex_direction: Option<String>, // "row", "column"
    pub align_items: Option<String>,    // "center", "start", "end"
    pub justify_content: Option<String>,
    pub gap: Option<f64>,
    
    // Sizing
    pub width: Option<DimensionValue>,
    pub height: Option<DimensionValue>,
    
    // Spacing
    pub padding: Option<f64>,
    pub margin: Option<f64>,
    
    // Colors (parsed from "#rrggbb" or "rgb(r,g,b)")
    pub background_color: Option<String>,
    pub color: Option<String>,
    
    // Border
    pub border_radius: Option<f64>,
    pub border_width: Option<f64>,
    pub border_color: Option<String>,
}
```

### EventPayload (Rust → JS)

```rust
pub struct EventPayload {
    pub element_id: String,
    pub event_type: String,  // "click", "mouseEnter", etc.
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub key: Option<String>,
    pub modifiers: Option<EventModifiers>,
}
```

## Building

### GPUI dependency

GPUI comes from a pinned git revision of `remorses/zed` (branch
`gpui-macos-embedded`) — no Zed checkout or submodule is needed. See
[docs/gpui-dependency.md](./docs/gpui-dependency.md) for the full map. Key points:

- macOS uses `MacPlatform::new_embedded()` and pumps AppKit on Node's main thread
- Windows and Linux run `gpui_platform::application().run()` on a dedicated UI thread
- `gpui_macos` is a direct macOS dependency for production and the GPU-backed test renderer
- The fork exists only for the embedded macOS loop; `crates/gpui` itself matches upstream
- `core-text = 21.0.0`, `core-graphics = 0.24.0` for macOS, avoiding a
  core-graphics 0.24 vs 0.25 conflict with Zed's `font-kit` fork

### Rust toolchain

`rust-toolchain.toml` pins the same channel as the pinned GPUI revision's
`rust-toolchain.toml`. When bumping the pin, update ours to match or GPUI may not compile.

### Metal toolchain (macOS)

`gpui_apple` compiles `shaders.metal` in its build script. Xcode 26 no longer ships the
Metal compiler by default, so a fresh machine fails with
`cannot execute tool 'metal' due to missing Metal Toolchain`. Install it once:

```bash
xcodebuild -downloadComponent MetalToolchain
```

### Bumping the gpui revision

1. Merge upstream Zed into the `gpui-macos-embedded` branch in `remorses/zed`.
2. Resolve any embedded `gpui_macos` conflicts in a new commit; do not rewrite history.
3. Update `rev = "..."` in `packages/native/Cargo.toml`.
4. Match `rust-toolchain.toml` to the new revision's.
5. Run `cargo check --all-targets`, `bun run build`, and the test suites.

## Current Status

Keep this list in sync with the README **Status** section. User-facing APIs
belong in README. This list is only the remaining engineering work.

### Completed

- [x] React reconciler with mutation-based protocol
- [x] napi-rs FFI bindings and RetainedTree
- [x] Style mapping, including native `hover` / `active`
- [x] Mouse, keyboard, focus, scroll, and click-outside events
- [x] `commitMutations()` stores the view entity and calls `cx.notify()`
- [x] GPU-backed test renderer
- [x] Native `<input>` and `<textarea>`
- [x] `<img>` (local raster/SVG) and `<svg>` (tintable monochrome icons)
- [x] `<virtual-list>`
- [x] `<code>`, `<diff>`, `<markdown>` with Tree-sitter
- [x] Cross-element text selection
- [x] Headless Select, Combobox, Tooltip
- [x] `setWindowTitle`
- [x] Window chrome (`titlebarTransparent`, `windowBackground`, traffic-light position)
- [x] Last window close quits the process
- [x] Debug frame overlay (`setDebugFrameOverlay`)

### TODO

#### High Priority

- [ ] **Background highlighting** - move Tree-sitter off the frame thread once
      there is a way to request a repaint from a background task

#### Medium Priority

- [ ] **Canvas** - custom drawing element (`<canvas>` is typed, not implemented)

#### Low Priority

- [ ] **Window controls** - resize, minimize (title already works)
- [ ] **Multiple windows** - Support multiple GPUI windows
- [x] **JS remount** - `render()` plus `bun --hot` remounts the React tree on the same window
- [ ] **React Refresh** - keep `useState` across saves. Needs Bun to run the Fast Refresh transform during `bun --hot`
- [ ] **Native hot reload** - cannot unload a `.node`. `bun run dev` rebuilds and restarts
- [ ] **DevTools** - React DevTools integration
- [ ] **Animations** - Interpolated style transitions

## Testing

### Unit Tests

```bash
# Rust unit tests (selection, syntax, diff parser, markdown parser, theme)
cd packages/native && cargo test --lib

# React reconciler + GPU-backed test renderer
cd packages/react && bun run test

# Example app tests
cd examples && bun run test
```

Use `bun run test`, not `bun test`. The suites are vitest, so `bun test` picks the
wrong runner and fails on the `vitest` imports.

### Asserting on native elements

`getAllText()` reads the retained tree, so it only sees `<text>` nodes. `<code>`,
`<diff>` and `<markdown>` paint inside gpui and are invisible to it. Use
`renderer.getPaintedText()` (every string painted last frame, in paint order) and
`renderer.dragSelect(x1, y1, x2, y2)` instead.

`dragSelect` exists because selection listeners are registered during **paint**:
calling `simulateMouseDown` / `Move` / `Up` by hand without a flush between each
step silently selects nothing.

Screenshots go to `packages/react/screenshots/` (gitignored), not `/tmp`, so they
can be inspected after a run.

### Integration Test

```bash
# Run example with tsx (use tmux for long-running sessions so it does not block the shell)
cd examples
npx tsx counter.tsx
```

### UI Screenshot Validation (macOS)

To validate rendering changes, capture a window screenshot via CLI and then ask a task to describe it.

```bash
# Set a predictable window title in the example
# renderer.setWindowTitle("GPUIX Counter")

# List onscreen windows and get the window id (kCGWindowNumber)
osascript -e 'tell application "System Events" to get the name of every process'

# Capture the GPUI window by title (may prompt for Screen Recording permission)
WINDOW_ID=$(osascript -l JavaScript -e 'ObjC.import("CoreGraphics"); var title="GPUIX Counter"; var info=ObjC.unwrap($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID)); for (var i=0;i<info.length;i++){ var w=info[i]; if (w.kCGWindowLayer!==0) continue; if ((w.kCGWindowName||"")===title) { console.log(w.kCGWindowNumber); return; }}')
screencapture -x -l "$WINDOW_ID" /tmp/gpuix-window.png
```

Then use the task tool to analyze the image:

```text
Use Task to analyze /tmp/gpuix-window.png and describe what UI elements and text are visible.
```

Note: `screencapture` and the JXA window listing may require Screen Recording permission in System Settings (Privacy & Security). If the command prints nothing, grant permission to the terminal/osascript process and retry.

## Related Projects

- [GPUI](https://github.com/zed-industries/zed/tree/main/crates/gpui) - Zed's GPU UI framework
- [opentui](https://github.com/anomalyco/opentui) - Terminal UI with React (reconciler reference)
- [create-gpui-app](https://github.com/zed-industries/create-gpui-app) - Official GPUI starter template
- [react-reconciler](https://github.com/facebook/react/tree/main/packages/react-reconciler) - React's custom renderer API

## Contributing

1. Rust changes go in `packages/native/src/`
2. TypeScript changes can be made directly in `packages/react/`, `packages/solid/` or `packages/core/`


## Examples using same tech as ours. To unblock on issues and compare to our code

For example usage of projects depending on gpui in rust: opensrc https://github.com/zed-industries/create-gpui-app

For examples of NAPI rs native packages: https://github.com/napi-rs/package-template and https://github.com/Brooooooklyn/Image

For reading gpui source code: https://github.com/zed-industries/sed inside crates/gpui

For examples of a custom React renderer: https://github.com/anomalyco/opentui inside packages/react
