---
'@gpuix/react': patch
---

Add `bun run dev`, a watch loop for the Rust side.

There is no hot reload for the native half and there cannot be: `require()` of a `.node` file calls `process.dlopen`, Node has no matching unload, and the live state (the winit event loop, the wgpu device, the open window, the selection registry) lives in thread-locals of the loaded library. A second load would get empty thread-locals and a dead window.

The rebuild is fast enough that it does not matter. `bun run dev` watches `packages/native/src`, rebuilds the addon, and re-renders the screenshot tests. **A Rust edit reaches fresh PNGs in about 4 seconds.**

```bash
bun run dev                            # rebuild, re-render the showcase screenshots
bun scripts/dev.ts --shots diff        # only tests matching "diff"
bun scripts/dev.ts --app native-text   # rebuild, restart an example app
```

Screenshot mode is the default because `packages/react/screenshots/*.png` reload live in Preview.app and, unlike a window, can be read by an agent.
