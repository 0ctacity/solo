---
'@gpuix/react': patch
---

Keep macOS scroll at the display rate when a frame is already expensive.

`tick()` pumps AppKit and draws. The loop used to sleep a fixed **8ms** after
every tick. A 10ms scroll frame plus that sleep ran at about **55fps** on a
120Hz display.

The next pump now waits only the leftover budget. If the frame already used
8ms or more, the next `tick()` runs on the next event-loop turn.

Idle apps stay cheap. Short ticks still sleep. Only long frames skip the extra
wait.
