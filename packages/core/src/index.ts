// Solo Core — private implementation kernel for @solo/solid.
//
// It deliberately does not import Solid: it owns the native mutation protocol
// vocabulary, event registry, batching, and frame loop used by the Solid host.

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
