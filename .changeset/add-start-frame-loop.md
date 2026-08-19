---
'@gpuix/react': minor
'@gpuix/native': patch
---

Add `startFrameLoop()` and stop burning CPU on idle apps.

`renderer.tick()` pumps the OS event loop and asks GPUI for a frame, so it has to be called repeatedly. The documented pattern was a `setImmediate` loop, which spins at roughly **27,000 ticks per second**. On a completely idle counter app that measured **73.5% CPU**.

Two things caused it. The loop never yielded, and GPUIX passed `require_presentation: true` on every frame request. That flag disables every frame throttle inside GPUI and forces `window.present()` on each tick even when nothing changed. GPUI's own platforms pass `Default::default()` for routine frames and reserve `require_presentation` for compositor damage events.

Replace the hand-written loop:

```tsx
import { startFrameLoop } from '@gpuix/react'

startFrameLoop(renderer)
```

```tsx
// customise the rate, and stop it later
const loop = startFrameLoop(renderer, { frameMs: 16 })
loop.stop()
```

The default is ~125fps, above any common display refresh rate. Each frame is scheduled only after the previous one finishes, so a slow frame delays the next instead of letting timers pile up. Pacing stays in JS rather than blocking inside `tick()`, because Node owns the event loop here and a blocking tick would stall every timer, promise and socket in the process.

Measured on an idle app:

| | ticks/sec | CPU |
|---|---|---|
| `setImmediate` loop | ~27,000 | 73.5% |
| `startFrameLoop` | ~125 | ~1% |

Rendering is unchanged: one draw per React commit, and no draws at all while idle.
