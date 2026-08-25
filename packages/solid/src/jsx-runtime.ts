/// JSX types for @solo/solid.
///
/// babel-preset-solid compiles user JSX to universal runtime calls and never
/// imports this module at runtime — it exists so TypeScript can type-check
/// Solid JSX with `"jsxImportSource": "@solo/solid"` (see the
/// solid-js/universal README). Types are deliberately permissive: the native
/// protocol accepts style objects, event handlers and custom props.

import type { StyleDesc } from "@solo/core"

export interface GpuixIntrinsicProps {
  style?: StyleDesc
  children?: unknown
  onClick?: (event: unknown) => void
  onMouseDown?: (event: unknown) => void
  onMouseUp?: (event: unknown) => void
  onMouseEnter?: (event: unknown) => void
  onMouseLeave?: (event: unknown) => void
  onKeyDown?: (event: unknown) => void
  onKeyUp?: (event: unknown) => void
  onFocus?: (event: unknown) => void
  onBlur?: (event: unknown) => void
  testId?: string
  [key: string]: unknown
}

export namespace JSX {
  export type Element = unknown

  export interface IntrinsicElements {
    div: GpuixIntrinsicProps
    text: GpuixIntrinsicProps
    img: GpuixIntrinsicProps
    svg: GpuixIntrinsicProps
    canvas: GpuixIntrinsicProps
    input: GpuixIntrinsicProps
    textarea: GpuixIntrinsicProps
    anchored: GpuixIntrinsicProps
    code: GpuixIntrinsicProps
    diff: GpuixIntrinsicProps
    markdown: GpuixIntrinsicProps
    "virtual-list": GpuixIntrinsicProps
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
