// Solo — Solid bindings for Solo.

export { render } from "./root.js"
export type { Root, RenderOptions, FrameLoop } from "./root.js"
export { View, Text, Button } from "./components.js"
export type { ViewProps, TextProps, ButtonProps } from "./components.js"
export {
  resetIdCounter,
  flushMutations,
  setSoloRenderer,
  getSoloRenderer,
} from "./runtime.js"
export type { SoloSolidNode } from "./runtime.js"

export {
  createSolidNativeTestRoot,
  hasNativeTestRenderer,
} from "./testing.js"
export type { SolidNativeTestRoot } from "./testing.js"
