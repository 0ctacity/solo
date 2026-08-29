/// JSX types for @solo/solid.
///
/// babel-preset-solid compiles user JSX to universal runtime calls and never
/// imports this module at runtime — it exists so TypeScript can type-check
/// Solid JSX with `"jsxImportSource": "@solo/solid"` (see the
/// solid-js/universal README). Types are deliberately permissive: the native
/// protocol accepts style objects, event handlers and custom props.

import type { StyleDesc } from "@solo/core"
import type { EventPayload } from "@solo/native"

export interface SoloIntrinsicProps {
  style?: StyleDesc
  children?: unknown
  onClick?: (event: EventPayload) => void
  onMouseDown?: (event: EventPayload) => void
  onMouseUp?: (event: EventPayload) => void
  onMouseEnter?: (event: EventPayload) => void
  onMouseLeave?: (event: EventPayload) => void
  onKeyDown?: (event: EventPayload) => void
  onKeyUp?: (event: EventPayload) => void
  onFocus?: (event: EventPayload) => void
  onBlur?: (event: EventPayload) => void
  testId?: string
  [key: string]: unknown
}

export namespace JSX {
  export type Element = unknown

  export interface IntrinsicElements {
    div: SoloIntrinsicProps
    text: SoloIntrinsicProps
    img: SoloIntrinsicProps
    svg: SoloIntrinsicProps
    canvas: SoloIntrinsicProps
    input: SoloIntrinsicProps
    textarea: SoloIntrinsicProps
    anchored: SoloIntrinsicProps
    code: SoloIntrinsicProps
    diff: SoloIntrinsicProps
    markdown: SoloIntrinsicProps
    "virtual-list": SoloIntrinsicProps
  }
}

// Never called at runtime — babel-preset-solid emits universal ops instead.
export function jsx(_type: string, _props: Record<string, unknown>, _key?: string): JSX.Element {
  throw new Error("jsx-runtime is types-only; compile JSX with babel-preset-solid")
}

export const jsxs = jsx

export function Fragment(_props: { children?: unknown }): JSX.Element {
  throw new Error("jsx-runtime is types-only; compile JSX with babel-preset-solid")
}
