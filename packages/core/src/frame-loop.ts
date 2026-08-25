/// Frame loop for platforms where GPUI does not own a blocking UI thread.
/// Framework-neutral: any renderer package can drive the embedded event loop
/// with this.

import type { GpuixRenderer } from "@solo/native"

/** ~125fps. Above any common display refresh rate, so frames are never the
 *  bottleneck, while still leaving the Node event loop almost entirely idle. */
const DEFAULT_FRAME_MS = 8

export interface FrameLoop {
  stop: () => void
}

/**
 * Drive GPUI's embedded macOS event loop at a fixed rate.
 *
 * On Windows and Linux, GPUI owns a blocking event loop on a Rust UI thread,
 * so this function returns a no-op handle without creating a timer.
 *
 * On macOS, `renderer.tick()` pumps AppKit and asks GPUI for a frame, so it
 * must be called repeatedly. Do NOT call it from a `setImmediate` loop: that
 * spins the CPU at tens of thousands of ticks per second (measured: 73% CPU on
 * an idle app, versus 1.5% when paced).
 *
 * Pacing lives in JS rather than blocking inside `tick()` on purpose. Node owns
 * the event loop here, so a blocking tick would stall every timer, promise and
 * socket in the process.
 *
 * Each frame is scheduled only after the previous one finishes, so a slow frame
 * delays the next one instead of letting timers pile up.
 *
 * If `tick()` already used the whole budget, wait 0ms. A fixed 8ms sleep after a
 * 10ms frame would cap scroll at ~55fps on a 120Hz display.
 *
 * `tick()` returning false means the last window closed. The loop stops and
 * `onTerminated` runs.
 */
export function startFrameLoop(
  renderer: Pick<GpuixRenderer, "requiresTick" | "tick">,
  options: { frameMs?: number; onTerminated?: () => void } = {}
): FrameLoop {
  if (!renderer.requiresTick()) {
    return { stop: () => {} }
  }

  const frameMs = options.frameMs ?? DEFAULT_FRAME_MS
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const stop = (): void => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const loop = (): void => {
    if (stopped) return
    const started = performance.now()
    const running = renderer.tick()
    if (running === false) {
      stop()
      options.onTerminated?.()
      return
    }
    const wait = Math.max(0, frameMs - (performance.now() - started))
    timer = setTimeout(loop, wait)
  }
  loop()

  return { stop }
}
