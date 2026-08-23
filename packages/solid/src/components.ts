/// Semantic primitives for GPUIX Solid apps.
///
/// Thin wrappers over existing native intrinsic elements — no new Rust.
/// Written against the runtime ops directly (rather than JSX) so the package
/// builds with plain tsc; compiled user JSX lands on the same ops anyway.

import type { EventPayload } from "@gpuix/native"
import type { StyleDesc } from "@gpuix/core"
import { merge } from "solid-js"
import { universal } from "./runtime.js"
import type { GpuixSolidNode } from "./runtime.js"

export interface ViewProps {
  style?: StyleDesc
  children?: unknown
  onClick?: (event: EventPayload) => void
  onMouseDown?: (event: EventPayload) => void
  onMouseUp?: (event: EventPayload) => void
  onMouseEnter?: (event: EventPayload) => void
  onMouseLeave?: (event: EventPayload) => void
  /** Stable locator id for automation and tests. */
  testId?: string
}

/** A flex container. Maps to the native "div" element. */
export function View(props: ViewProps): GpuixSolidNode {
  const el = universal.createElement("div")
  universal.spread(el, props as Record<string, unknown>)
  return el
}

export interface TextProps {
  style?: StyleDesc
  children?: unknown
  /** Stable locator id for automation and tests. */
  testId?: string
}

/** Styled text content. Maps to the native "text" element. */
export function Text(props: TextProps): GpuixSolidNode {
  const el = universal.createElement("text")
  // spread handles style, events, custom props AND the (reactive) children.
  universal.spread(el, props as Record<string, unknown>)
  return el
}

const BUTTON_BASE_STYLE: StyleDesc = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  paddingLeft: 20,
  paddingRight: 20,
  paddingTop: 10,
  paddingBottom: 10,
  backgroundColor: "#a6e3a1",
  borderRadius: 8,
  cursor: "pointer",
}

export interface ButtonProps extends Omit<ViewProps, "style"> {
  style?: StyleDesc
}

/** A clickable button. A native "div" with sensible default styles. */
export function Button(props: ButtonProps): GpuixSolidNode {
  const el = universal.createElement("div")
  const merged = merge(props, {
    get style(): StyleDesc {
      return { ...BUTTON_BASE_STYLE, ...props.style }
    },
  })
  universal.spread(el, merged as Record<string, unknown>)
  return el
}
