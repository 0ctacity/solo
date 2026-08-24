/// Frame-loop scheduling semantics. Ported from packages/react
/// events.test.tsx ("frame loop" describe) — startFrameLoop lives in core.

import { describe, expect, it } from "vitest"
import { startFrameLoop } from "../frame-loop.js"

describe("frame loop", () => {
  it("does not tick when the native platform owns its event loop", () => {
    let ticks = 0
    const loop = startFrameLoop({
      requiresTick: () => false,
      tick: () => {
        ticks += 1
      },
    })

    expect(ticks).toBe(0)
    loop.stop()
  })

  it("schedules the next tick immediately after a long tick", async () => {
    let ticks = 0
    const loop = startFrameLoop(
      {
        requiresTick: () => true,
        tick: () => {
          ticks += 1
          if (ticks === 1) {
            const start = Date.now()
            while (Date.now() - start < 25) {}
          }
        },
      },
      { frameMs: 20 },
    )
    await new Promise((resolve) => setTimeout(resolve, 8))
    loop.stop()
    expect(ticks).toBeGreaterThanOrEqual(2)
  })

  it("still waits after a short tick", async () => {
    let ticks = 0
    const loop = startFrameLoop(
      {
        requiresTick: () => true,
        tick: () => {
          ticks += 1
        },
      },
      { frameMs: 40 },
    )
    await new Promise((resolve) => setTimeout(resolve, 15))
    loop.stop()
    expect(ticks).toBe(1)
  })

  it("stops and reports termination when tick returns false", async () => {
    let ticks = 0
    let terminated = 0
    const loop = startFrameLoop(
      {
        requiresTick: () => true,
        tick: () => {
          ticks += 1
          return false
        },
      },
      {
        frameMs: 5,
        onTerminated: () => {
          terminated += 1
        },
      },
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(ticks).toBe(1)
    expect(terminated).toBe(1)
    loop.stop()
  })
})
