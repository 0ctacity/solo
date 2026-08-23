---
'@gpuix/native': minor
'@gpuix/react': minor
---

Wire window chrome that was already on `WindowOptions` but ignored at open time.

`render()` now honors **transparent titlebar**, **traffic-light position**, and **blurred / transparent** window backgrounds. That is what a Waku-style sidebar needs: traffic lights sit in the sidebar, and the native titlebar does not take a strip above the app.

```tsx
import { render } from '@gpuix/react'

render(<App />, {
  title: 'Waku',
  width: 1180,
  height: 820,
  titlebarTransparent: true,
  windowBackground: 'blurred',
  trafficLightX: 16,
  trafficLightY: 17,
})
```

`windowBackground` is `"opaque"` (default), `"transparent"`, or `"blurred"`. The older `transparent: true` flag still maps to a transparent background when `windowBackground` is unset.
