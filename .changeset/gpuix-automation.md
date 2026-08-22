---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add a Playwright-like automation API for GPUIX tests and live apps.

Use `testId` to mark elements, then drive them from tests or from another
process over SSE `data:` lines. Ordinary log lines are ignored.

```ts
import { connectTest } from '@gpuix/react/automation'

const app = await connectTest(renderer)
await app.getByTestId('inc').click()
await app.getByText('Count: 1').waitFor()
await app.captureFrames('review/sidebar', [0, 150, 300])
```

A live app listens on stdin when stdin is a pipe, not a TTY. A terminal
run is unchanged. `gpuix.launch({ command, args })` pipes stdin and speaks
`data: {"id":1,"method":"click",...}` lines. Ordinary log lines are ignored.
