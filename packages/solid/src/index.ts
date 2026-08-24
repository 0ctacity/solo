// GPUIX Solid — Solid bindings for GPUIX.

export { render } from "./root.js"
export type { Root, RenderOptions, FrameLoop } from "./root.js"
export { View, Text, Button } from "./components.js"
export type { ViewProps, TextProps, ButtonProps } from "./components.js"
export {
  resetIdCounter,
  flushMutations,
  setGpuixRenderer,
  getGpuixRenderer,
} from "./runtime.js"
export type { GpuixSolidNode } from "./runtime.js"

export {
  createSolidNativeTestRoot,
  hasNativeTestRenderer,
} from "./testing.js"
export type { SolidNativeTestRoot } from "./testing.js"
