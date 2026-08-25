/// macOS-only GPU-backed test harness for @solo/solid.
///
/// Mirrors packages/react/src/testing.ts: mounts Solid trees through the
/// native TestGpuixRenderer so tests exercise the same GPUI pipeline as
/// production. On non-macOS builds hasNativeTestRenderer is false and the
/// suites using this harness skip themselves; headless coverage comes from
/// MockNativeRenderer-based tests instead.

import type { EventPayload } from "@solo/native"
import { clearEventHandlers, handleGpuixEvent, wrapWithBatching } from "@solo/core"
import { mount as mountTree, resetIdCounter, flushMutations } from "./runtime.js"

interface NativeTestRendererApi {
  flush(): void
  drainEvents(): EventPayload[]
  simulateKeystrokes(keystrokes: string): void
  focusElement(elementId: number): void
  simulateClick(x: number, y: number): void
  simulateScrollWheel(x: number, y: number, deltaX: number, deltaY: number): void
  scrollToItem(elementId: number, index: number): void
  scrollTo(elementId: number, x: number, y: number): void
  getScrollOffset(elementId: number): number[] | null
  clearSelection(): void
  getElementBounds(elementId: number): number[] | null
  getAllText(): string[]
  getPaintedText(): string[]
  getAutomationTree(): string
  dragSelect(x1: number, y1: number, x2: number, y2: number): void
  getSelectedText(): string | null
  captureScreenshot(path: string): void
}

interface NativeTestRendererConstructor {
  new (): NativeTestRendererApi
}

let NativeTestRenderer: NativeTestRendererConstructor | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const native = require("@solo/native") as {
    TestGpuixRenderer?: NativeTestRendererConstructor
  }
  if (native.TestGpuixRenderer) {
    NativeTestRenderer = native.TestGpuixRenderer
  }
} catch {
  // Native module unavailable — harness stays disabled.
}

export const hasNativeTestRenderer = NativeTestRenderer != null

/** Mounted Solid tree against the native GPU-backed renderer. */
export interface SolidNativeTestRoot {
  renderer: NativeTestRendererApi
  render: (code: () => unknown) => void
  unmount: () => void

  // ── inspection ──
  getAllText(): string[]
  getPaintedText(): string[]
  findByType(type: string): Array<{ id: number }>
  getElementBounds(elementId: number): number[] | null
  // ── simulation ──
  nativeSimulateKeystrokes(elementId: number, keystrokes: string): void
  simulateKeystrokes(keystrokes: string): void
  nativeSimulateClick(x: number, y: number): void
  focusElement(elementId: number): void
  nativeSimulateScrollWheel(x: number, y: number, deltaX: number, deltaY: number): void
  scrollToItem(elementId: number, index: number): void
  scrollTo(elementId: number, x: number, y: number): void
  getScrollOffset(elementId: number): number[] | null
  clearSelection(): void
  dragSelect(x1: number, y1: number, x2: number, y2: number): string | null
  captureScreenshot(path: string): void
}

export function createSolidNativeTestRoot(): SolidNativeTestRoot {
  if (!NativeTestRenderer) {
    throw new Error(
      "Native TestGpuixRenderer not available. Build with test-support to run tests."
    )
  }
  const native = new NativeTestRenderer()
  const batched = wrapWithBatching(native as never)

  let dispose: (() => void) | null = null

  function dispatchNativeEvents(): void {
    for (;;) {
      const events = native.drainEvents()
      if (events.length === 0) break
      for (const event of events) handleGpuixEvent(event)
      // Force the mutations queued by Solid's handlers into the native tree.
      flushMutations()
    }
  }

  const root: SolidNativeTestRoot = {
    renderer: native,
    render(code) {
      if (dispose) dispose()
      resetIdCounter()
      clearEventHandlers()
      dispose = mountTree(code as never, batched as never)
      native.flush()
    },
    unmount() {
      dispose?.()
      dispose = null
      native.flush()
    },

    getAllText: () => native.getAllText(),
    getPaintedText: () => native.getPaintedText(),

    findByType(type) {
      const raw = JSON.parse(native.getAutomationTree()) as {
        children?: Array<{ id: number; type: string; children?: unknown[] }>
      } | null
      const found: Array<{ id: number }> = []
      const walk = (node: { id: number; type: string; children?: unknown[] }): void => {
        if (node.type === type) found.push({ id: node.id })
        for (const child of node.children ?? []) walk(child as never)
      }
      for (const child of raw?.children ?? []) walk(child as never)
      return found
    },

    getElementBounds: (id) => native.getElementBounds(id),

    nativeSimulateKeystrokes(elementId, keystrokes) {
      native.flush()
      native.focusElement(elementId)
      native.simulateKeystrokes(keystrokes)
      dispatchNativeEvents()
      native.flush()
    },

    nativeSimulateClick(x, y) {
      native.flush()
      native.simulateClick(x, y)
      dispatchNativeEvents()
      native.flush()
    },

    focusElement(elementId) {
      native.flush()
      native.focusElement(elementId)
      dispatchNativeEvents()
    },

    dragSelect(x1: number, y1: number, x2: number, y2: number) {
      native.dragSelect(x1, y1, x2, y2)
      return native.getSelectedText()
    },

    simulateKeystrokes(keystrokes: string) {
      native.flush()
      native.simulateKeystrokes(keystrokes)
      dispatchNativeEvents()
      native.flush()
    },

    nativeSimulateScrollWheel(x: number, y: number, deltaX: number, deltaY: number) {
      native.flush()
      native.simulateScrollWheel(x, y, deltaX, deltaY)
      dispatchNativeEvents()
      native.flush()
    },

    scrollToItem(elementId: number, index: number) {
      native.flush()
      native.scrollToItem(elementId, index)
      native.flush()
    },

    scrollTo(elementId: number, x: number, y: number) {
      native.flush()
      native.scrollTo(elementId, x, y)
      native.flush()
    },

    getScrollOffset(elementId: number) {
      native.flush()
      return native.getScrollOffset(elementId)
    },

    clearSelection() {
      native.clearSelection()
      native.flush()
    },

    captureScreenshot(path: string) {
      native.flush()
      native.captureScreenshot(path)
    },
  }

  return root
}
