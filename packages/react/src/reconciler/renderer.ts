import React from "react"
import type { ReactNode } from "react"
import type { OpaqueRoot } from "react-reconciler"
import { ConcurrentRoot } from "react-reconciler/constants.js"
import { GpuixRenderer } from "@gpuix/native"
import type { EventPayload, WindowOptions } from "@gpuix/native"
import { reconciler } from "./reconciler.js"
import type { Container, DebugFrameOverlayMode, NativeRenderer } from "../types/host.js"
import { clearEventHandlers, handleGpuixEvent } from "@gpuix/core"
import { startFrameLoop } from "@gpuix/core"
import type { FrameLoop } from "@gpuix/core"
import { resetIdCounter, setNativeRenderer } from "./host-config.js"
import { wrapWithBatching } from "@gpuix/core"
import { GpuixContext } from "../hooks/use-gpuix.js"
import {
  InProcessBackend,
  liveRendererAsTest,
  serveAutomationStdio,
  type LiveAutomationRenderer,
} from "../automation/client.js"

export function createRenderer(
  onEvent?: (event: import("@gpuix/native").EventPayload) => void
): GpuixRenderer {
  const renderer = new GpuixRenderer((err, event) => {
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
  // A pipe means a controller owns stdin. A TTY is a human keyboard.
  if (!process.stdin.isTTY) {
    const init = renderer.init.bind(renderer)
    renderer.init = (options) => {
      init(options)
      enableAutomation(renderer)
    }
  }
  return renderer
}

export interface Root {
  render: (node: ReactNode) => void
  unmount: () => void
}

// Re-exported so existing imports from this module keep working.
export { startFrameLoop }
export type { FrameLoop }

export function enableAutomation(renderer: LiveAutomationRenderer): void {
  serveAutomationStdio(new InProcessBackend(liveRendererAsTest(renderer)))
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
      // Must be sync. A late unmount destroy()s remounted ids and the window goes black.
      flushSync(() => {
        reconciler.updateContainer(null, container, null, () => {})
      })
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
  /** GPUI scene overlay. Does not go through React or layout. */
  debugFrameOverlay?: DebugFrameOverlayMode
}

export function resetRender(): void {
  Reflect.deleteProperty(globalThis, RENDER_HOST_KEY)
}

/** Mount the app. Under `bun --hot`, later calls remount on the same native window. */
export function render(node: ReactNode, options: RenderOptions = {}): Root {
  const { onEvent, renderer: injected, debugFrameOverlay, ...windowOptions } = options
  const slot = renderSlot()
  const remount = slot.root != null
  if (!slot.renderer) {
    if (injected) {
      slot.renderer = injected
    } else {
      const renderer = createRenderer(onEvent)
      renderer.init(windowOptions)
      slot.renderer = renderer
      console.log("[gpuix] created native window")
    }
  }
  const host = slot.renderer
  if (!host) {
    throw new Error("GPUIX renderer is not initialized")
  }
  if (debugFrameOverlay) {
    host.setDebugFrameOverlay?.(debugFrameOverlay)
  }
  if (slot.root) {
    console.log("[gpuix] remount: unmount previous tree")
    slot.root.unmount()
    resetIdCounter()
  }
  const root = createRoot(host)
  slot.root = root
  flushSync(() => {
    root.render(node)
  })
  if (!injected && slot.renderer instanceof GpuixRenderer) {
    const native = slot.renderer
    slot.loop?.stop()
    slot.loop = startFrameLoop(native, {
      onTerminated: () => {
        process.exit(0)
      },
    })
  }
  console.log(remount ? "[gpuix] remount complete" : "[gpuix] mount complete")
  return root
}
