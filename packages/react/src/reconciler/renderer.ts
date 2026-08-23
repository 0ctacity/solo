import React from "react"
import type { ReactNode } from "react"
import type { OpaqueRoot } from "react-reconciler"
import { ConcurrentRoot } from "react-reconciler/constants.js"
import { GpuixRenderer } from "@gpuix/native"
import type { EventPayload, WindowOptions } from "@gpuix/native"
import { reconciler } from "./reconciler.js"
import type { Container, NativeRenderer } from "../types/host.js"
import { clearEventHandlers, handleGpuixEvent } from "./event-registry.js"
import { resetIdCounter, setNativeRenderer } from "./host-config.js"
import { wrapWithBatching } from "./batch-renderer.js"
import { GpuixContext } from "../hooks/use-gpuix.js"

export function createRenderer(
  onEvent?: (event: import("@gpuix/native").EventPayload) => void
): GpuixRenderer {
  return new GpuixRenderer((err, event) => {
    if (err) {
      console.error("[GPUIX] Native event error:", err)
      return
    }
    if (event) {
      handleGpuixEvent(event)
      if (onEvent) {
        onEvent(event)
      }
    }
  })
}

export interface Root {
  render: (node: ReactNode) => void
  unmount: () => void
}

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
 */
export function startFrameLoop(
  renderer: Pick<GpuixRenderer, "requiresTick" | "tick">,
  options: { frameMs?: number } = {}
): FrameLoop {
  if (!renderer.requiresTick()) {
    return { stop: () => {} }
  }

  const frameMs = options.frameMs ?? DEFAULT_FRAME_MS
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const loop = (): void => {
    if (stopped) return
    renderer.tick()
    timer = setTimeout(loop, frameMs)
  }
  loop()

  return {
    stop: (): void => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
      timer = null
    },
  }
}

/**
 * Create a root for rendering React to GPUI (or a TestRenderer for tests).
 * Mutations go directly to the renderer — no JSON tree serialization.
 *
 * If the renderer supports applyBatch(), mutations are automatically batched
 * into a single FFI call per commit (N individual calls → 1 applyBatch call).
 */
export function createRoot(renderer: NativeRenderer): Root {
  let container: OpaqueRoot | null = null

  // Wrap with batching if the renderer supports applyBatch().
  // This reduces N FFI boundary crossings to 1 per React commit.
  const batchedRenderer = wrapWithBatching(renderer)

  // Wire up the batched renderer for host-config to use
  setNativeRenderer(batchedRenderer)

  const gpuixContainer: Container = {
    renderer: batchedRenderer,
  }

  const cleanup = (): void => {
    if (container) {
      reconciler.updateContainer(null, container, null, () => {})
      // @ts-expect-error types not up to date
      reconciler.flushSyncWork?.()
      container = null
    }
    clearEventHandlers()
  }

  // Create container once — reuse on subsequent render() calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  container = (reconciler.createContainer as any)(
    gpuixContainer,
    ConcurrentRoot,
    null,
    false,
    null,
    "",
    console.error,
    console.error,
    console.error,
    null
  )

  return {
    render: (node): void => {
      setNativeRenderer(batchedRenderer)
      clearEventHandlers()

      reconciler.updateContainer(
        React.createElement(
          GpuixContext.Provider,
          { value: { renderer: batchedRenderer } },
          node
        ),
        container,
        null,
        () => {}
      )
    },

    unmount: cleanup,
  }
}

export { reconciler }

const _r = reconciler as typeof reconciler & {
  flushSyncFromReconciler?: typeof reconciler.flushSync
}
export const flushSync = _r.flushSyncFromReconciler ?? _r.flushSync

const RENDER_HOST_KEY = "__gpuixRenderHost"

type RenderSlot = {
  renderer?: NativeRenderer
  root?: Root
  loop?: FrameLoop
}

function renderSlot(): RenderSlot {
  const existing = Reflect.get(globalThis, RENDER_HOST_KEY)
  if (existing) {
    return existing
  }
  const created: RenderSlot = {}
  Reflect.set(globalThis, RENDER_HOST_KEY, created)
  return created
}

export interface RenderOptions extends WindowOptions {
  onEvent?: (event: EventPayload) => void
  renderer?: NativeRenderer
}

export function resetRender(): void {
  Reflect.deleteProperty(globalThis, RENDER_HOST_KEY)
}

/** Mount the app. Under `bun --hot`, later calls remount on the same native window. */
export function render(node: ReactNode, options: RenderOptions = {}): Root {
  const { onEvent, renderer: injected, ...windowOptions } = options
  const slot = renderSlot()
  if (!slot.renderer) {
    if (injected) {
      slot.renderer = injected
    } else {
      const renderer = createRenderer(onEvent)
      renderer.init(windowOptions)
      slot.renderer = renderer
    }
  }
  if (slot.root) {
    slot.root.unmount()
    resetIdCounter()
  }
  const root = createRoot(slot.renderer)
  slot.root = root
  flushSync(() => {
    root.render(node)
  })
  if (!injected && slot.renderer instanceof GpuixRenderer) {
    const native = slot.renderer
    slot.loop?.stop()
    slot.loop = startFrameLoop(native)
  }
  return root
}
