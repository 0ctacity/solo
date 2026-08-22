// GPUIX component definitions and native motion wrappers.

import { createElement, forwardRef } from "react"
import type { ReactElement, ReactNode } from "react"
import type { MotionProps, Props, PublicInstance, StyleDesc } from "../types/host.js"

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

export interface MotionDivProps extends MotionProps {
  children?: ReactNode
  style?: StyleDesc
  onClick?: Props["onClick"]
  onMouseDown?: Props["onMouseDown"]
  onMouseUp?: Props["onMouseUp"]
  onMouseEnter?: Props["onMouseEnter"]
  onMouseLeave?: Props["onMouseLeave"]
  onMouseMove?: Props["onMouseMove"]
  onMouseDownOutside?: Props["onMouseDownOutside"]
  onKeyDown?: Props["onKeyDown"]
  onKeyUp?: Props["onKeyUp"]
  onFocus?: Props["onFocus"]
  onBlur?: Props["onBlur"]
  onScroll?: Props["onScroll"]
  autoFocus?: boolean
}

const MotionDiv = forwardRef<PublicInstance, MotionDivProps>(function MotionDiv(
  { initial, animate, transition, ...props },
  ref
): ReactElement {
  const hostProps: Props = {
    ...props,
    ref,
    motion: {
      ...(initial === undefined ? {} : { initial }),
      animate,
      ...(transition === undefined ? {} : { transition }),
    },
  }
  return createElement("div", hostProps)
})

/** Native animations with a Motion-like declarative React API. */
export const motion = {
  div: MotionDiv,
} as const
