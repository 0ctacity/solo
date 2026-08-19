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
│   │   │   └── style.rs        # StyleDesc, color parsing
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

## Auto-generated files (do NOT edit manually)

The following files in `packages/native/` are auto-generated by napi-rs during `bun run build`. Never edit them by hand — they are regenerated from the Rust `#[napi]` annotations every build:

- `packages/native/index.d.ts` — TypeScript type declarations
- `packages/native/index.js` — Node.js loader/binding glue
- `packages/native/*.node` — compiled native binary

To update the TypeScript API surface, edit the Rust source files in `packages/native/src/` (add/modify `#[napi]` structs, methods, functions), then run `bun run build` in `packages/native` to regenerate.

## Changesets

After completing a fix or feature, add a `.changeset/*.md` file at the repo root instead of editing CHANGELOG.md. Never edit CHANGELOG.md directly; it is generated at publish time. Never bump `package.json` version manually. Load the `changesets` skill for format and rules.

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

### Development (in zed workspace)

The native package depends on GPUI which has complex dependencies. For now, develop inside the zed workspace:

```bash
# In zed repo
cd crates/gpuix
cargo run --example hello --release
```

### Standalone Build

Standalone builds work by pinning GPUI and macOS text dependencies:

- `gpui`, `gpui_wgpu`, `gpui_macos` pinned to zed commit `d5dc01f2b54e0ae11215e76a0811743b3fc86e2f`
- `core-text = 21.0.0`, `core-graphics = 0.24.0` for macOS

These avoid the core-graphics 0.24 vs 0.25 conflict between `core-text` and Zed's `font-kit` fork.

### Rust toolchain

`rust-toolchain.toml` pins the same channel as zed's own `rust-toolchain.toml` for the
pinned gpui revision. When you bump the gpui revision, read zed's `rust-toolchain.toml`
at that commit and update ours to match, otherwise gpui will not compile.

### Metal toolchain (macOS)

`gpui_apple` compiles `shaders.metal` in its build script. Xcode 26 no longer ships the
Metal compiler by default, so a fresh machine fails with
`cannot execute tool 'metal' due to missing Metal Toolchain`. Install it once:

```bash
xcodebuild -downloadComponent MetalToolchain
```

### Bumping the gpui revision

1. Pick the new zed commit and replace all `rev = "..."` values in `packages/native/Cargo.toml`.
2. `cargo update -p gpui -p gpui_wgpu -p gpui_macos`
3. Match `rust-toolchain.toml` to zed's `rust-toolchain.toml` at that commit.
4. Check `cargo tree -i wgpu`. If two `wgpu` versions appear, bump our direct `wgpu`
   dependency to the version `gpui_wgpu` uses; a duplicate wgpu breaks surface creation.
5. `cargo check --all-targets`, then `bun run build`, then run the test suites.

## Current Status

### Completed

- [x] React reconciler structure (based on opentui pattern)
- [x] Element tree serialization (ElementDesc)
- [x] Style mapping (CSS-like → GPUI style methods)
- [x] napi-rs bindings structure
- [x] GpuixRenderer with render() and run()
- [x] build_element() - converts ElementDesc to GPUI elements
- [x] apply_styles() - maps all common CSS properties
- [x] Event wiring (click, mouseDown, mouseUp, mouseMove)
- [x] ThreadsafeFunction callback to JS for events
- [x] Pure Rust example (hello.rs) - works in zed workspace

### TODO

#### High Priority

- [x] **Build native package standalone** - Resolve GPUI dependency conflicts
- [x] **Generate TypeScript types** - Run napi build to create .d.ts files
- [x] **Test full pipeline** - JS → native → GPUI → screen
- [ ] **Re-render triggering** - Store Entity handle, call cx.notify() on tree update

#### Medium Priority

- [ ] **Focus management** - Wire up FocusHandle for keyboard events
- [ ] **onKeyDown/onKeyUp** - Keyboard event handlers
- [ ] **onFocus/onBlur** - Focus event handlers
- [ ] **Text input** - Handle text input (GPUI has no built-in input element)
- [ ] **More elements** - img (gpui::img), svg (gpui::svg), list (virtualized)

#### Low Priority

- [ ] **Window controls** - setTitle, resize, minimize, etc.
- [ ] **Multiple windows** - Support multiple GPUI windows
- [ ] **Hot reload** - Re-render on JS file changes
- [ ] **DevTools** - React DevTools integration
- [ ] **Animations** - Interpolated style transitions

## Testing

### Unit Tests

```bash
# React reconciler + GPU-backed test renderer (71 tests)
cd packages/react && bun run test

# Example app tests
cd examples && bun run test
```

Use `bun run test`, not `bun test`. The suites are vitest, so `bun test` picks the
wrong runner and fails on the `vitest` imports.

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

1. For Rust changes, work in `zed/crates/gpuix` (easier to build)
2. Copy changes to `gpuix/packages/native/src/` when ready
3. TypeScript changes can be made directly in `packages/react/`


## Examples using same tech as ours. To unblock on issues and compare to our code

For example usage of projects depending on gpui in rust: opensrc https://github.com/zed-industries/create-gpui-app

For examples of NAPI rs native packages: https://github.com/napi-rs/package-template and https://github.com/Brooooooklyn/Image

For reading gpui source code: https://github.com/zed-industries/sed inside crates/gpui

For examples of a custom React renderer: https://github.com/anomalyco/opentui inside packages/react
