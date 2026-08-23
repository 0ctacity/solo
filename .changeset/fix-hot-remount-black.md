---
'@gpuix/react': patch
---

Fix `bun --hot` remounts painting a **black window**.

`render()` unmounted the previous React root with a concurrent
`updateContainer(null)`. The remount then reused the same element ids. A
moment later the old unmount committed, `destroy()`d the new tree, and
GPUI painted an empty frame.

Unmount is now `flushSync`, so the old tree is gone before the new one
is created.

```tsx
import { render } from '@gpuix/react'

render(<App />, { title: 'My App', width: 800, height: 600 })

// save the file under `bun --hot`. Same window, new tree, not black.
```
