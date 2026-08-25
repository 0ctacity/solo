// Solo Core — framework-neutral primitives shared by every renderer package.
//
// This package must never depend on React, Solid, or any UI framework. It
// owns the native mutation protocol vocabulary (types + batching), the event
// handler registry that native events dispatch into, and the frame loop.

export * from "./types.js"
export {
  handleSoloEvent,
  handleGpuixEvent,
  registerEventHandler,
  unregisterEventHandler,
  unregisterEventHandlers,
  clearEventHandlers,
} from "./event-registry.js"
export { EVENT_PROPS, soloEventTypeForProp, gpuixEventTypeForProp, attachEventHandler } from "./events.js"
export { wrapWithBatching } from "./batching.js"
export type { MutationTuple } from "./batching.js"
export { startFrameLoop } from "./frame-loop.js"
export type { FrameLoop } from "./frame-loop.js"
export { MockNativeRenderer } from "./mock-renderer.js"
export type { MockElement } from "./mock-renderer.js"
