---
'@gpuix/react': minor
---

Add `render()` so a `bun --hot` save remounts React on the same native window.

```tsx
import { render } from '@gpuix/react'

function App() {
  return <div style={{ padding: 16 }}>hello</div>
}

render(<App />, { title: 'My App', width: 800, height: 600 })
```

```bash
bun --hot app.tsx
```

The first call creates the GPUI renderer, window, React root, and frame loop.
Later calls reuse that host and remount the tree. `useState` resets. The
native `.node` addon stays loaded.

`createRoot`, `createRenderer`, and `startFrameLoop` still exist for tests and
custom hosts. Pass `{ renderer }` into `render()` to drive the test renderer.

React Refresh (keep hook state across saves) is not included. Bun applies
`$RefreshReg$` in `bun build --react-fast-refresh`, not in `bun --hot`.
Asked for that in oven-sh/bun#40179.
