---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add GPUI's debug frame overlay so you can see draw time on a live window.

The overlay paints after layout. It is not a React element. A React FPS label would update every frame and cause more work.

```tsx
import { render } from '@gpuix/react'

render(<App />, { title: 'My App', debugFrameOverlay: 'full' })
```

Or call the renderer:

```ts
renderer.setDebugFrameOverlay('full')
renderer.cycleDebugFrameOverlay()
renderer.resetDebugFrameOverlayStats()
renderer.getDebugFrameOverlay()
```

Modes are `hidden` (default), `minimal` (last draw time), and `full` (`CUR`, `1%`, `10%`, `MAX`, `FRAMES`). The readout is **draw time**, not FPS. `8.3 MS` is about 120 Hz.
