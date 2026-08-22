// GPUIX component type definitions
// These map to GPUI element types

export const gpuixComponents = {
  div: "div",
  text: "text",
  img: "img",
  svg: "svg",
  canvas: "canvas",
  input: "input",
  textarea: "textarea",
  anchored: "anchored",
  "virtual-list": "virtual-list",
} as const

export type GpuixComponentType = keyof typeof gpuixComponents
