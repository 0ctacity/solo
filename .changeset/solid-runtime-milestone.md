---
"@gpuix/core": minor
"@gpuix/solid": minor
"@gpuix/react": minor
---

Add a Solid 2 runtime and extract framework-neutral core

- **@gpuix/core** (new): framework-neutral primitives extracted from @gpuix/react — native protocol types (`StyleDesc`, `NativeRenderer`, theme types), the shared event-handler registry, `wrapWithBatching` mutation batching, the frame loop, an event-prop mapping, and a `MockNativeRenderer` for tests on platforms without the macOS-only GPU test renderer. Depends on nothing but @gpuix/native.
- **@gpuix/solid** (new): Solid 2 (RC) custom renderer built on `@solidjs/universal`. Compiles with `babel-preset-solid` in universal mode (`moduleName: "@gpuix/solid/runtime"`) and maps Solid ops 1:1 onto the native mutation protocol — a signal-driven text change produces a single `setText` op, never a tree rebuild. Ships `View`/`Text`/`Button` primitives, a `render()` that opens a real GPUIX window, and a jsx-runtime entry for TypeScript.
- **@gpuix/react**: unchanged behavior; now imports its neutral pieces from @gpuix/core (public API stable).
