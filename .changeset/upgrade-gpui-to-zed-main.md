---
'@gpuix/native': minor
---

Upgrade GPUI to zed `d5dc01f2`, up from `14f37ed5`.

This picks up several months of GPUI work, including `Application::run_embedded()`, which is the API GPUIX needs. `NodePlatform::run()` returns immediately so that Node keeps owning the event loop, which meant the `App` was dropped as soon as `init()` returned and every later frame logged `app was released`. GPUIX now holds the returned `ApplicationHandle` for the lifetime of the process.

**Scroll events can now report a cancelled phase.** Previously a cancelled scroll gesture was reported to JS as `"ended"`.

```tsx
<div
  style={{ overflow: 'scroll' }}
  onScroll={(e) => {
    if (e.touchPhase === 'cancelled') return
    // ...
  }}
/>
```

**Building from source now requires Rust 1.97.1**, pinned in `rust-toolchain.toml` to match zed's own toolchain for this GPUI revision. On macOS you also need the Metal compiler, which Xcode 26 no longer ships by default:

```bash
xcodebuild -downloadComponent MetalToolchain
```

Prebuilt binaries from npm are unaffected; this only matters if you compile `@gpuix/native` yourself.
