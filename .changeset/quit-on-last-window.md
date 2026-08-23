---
'@gpuix/native': patch
'@gpuix/react': patch
---

Quit the process when the last window closes.

On macOS the red traffic-light button used to destroy the window and leave
the bun/Node process running. The Dock icon stayed. A later click did
nothing, because GPUIX is not an `.app` bundle and cannot relaunch.

Closing the last window now quits AppKit. The next `tick()` returns
`false`. `render()` exits the process, so the Dock icon goes away.

```ts
import { render } from '@gpuix/react'

render(<App />, { title: 'My App' })

// click the red button. The process exits.
// start the app again from the terminal.
```
