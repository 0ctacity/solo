import type { EventPayload } from "@gpuix/native"

export type DimensionValue = number | string

export interface StyleDesc {
  display?: string
  visibility?: string
  flexDirection?: string
  flexWrap?: string
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number
  alignItems?: string
  alignSelf?: string
  alignContent?: string
  justifyContent?: string
  gap?: number
  rowGap?: number
  columnGap?: number

  width?: DimensionValue
  height?: DimensionValue
  minWidth?: DimensionValue
  minHeight?: DimensionValue
  maxWidth?: DimensionValue
  maxHeight?: DimensionValue

  padding?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number

  margin?: number
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number

  position?: string
  top?: number
  right?: number
  bottom?: number
  left?: number

  background?: string
  backgroundColor?: string
  color?: string
  opacity?: number

  borderWidth?: number
  borderColor?: string
  borderRadius?: number
  borderTopLeftRadius?: number
  borderTopRightRadius?: number
  borderBottomLeftRadius?: number
  borderBottomRightRadius?: number

  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  textAlign?: string
  lineHeight?: number
  whiteSpace?: "normal" | "nowrap"
  textOverflow?: "ellipsis" | "ellipsis-start"
  lineClamp?: number

  overflow?: string
  overflowX?: string
  overflowY?: string

  cursor?: string

  /** "none" opts this element and its subtree out of text selection.
   *  Inherited like the CSS property, so a toolbar can disable it once. */
  userSelect?: "text" | "none" | "auto"
  /** Selection wash colour for this subtree. Defaults to the theme accent at 35%. */
  selectionColor?: string

  // Pseudo-selector styles — applied by GPUI natively (no JS round-trip).
  // Nesting is one level deep: hover/active cannot contain hover/active.
  hover?: Omit<StyleDesc, "hover" | "active">
  active?: Omit<StyleDesc, "hover" | "active">
}

// Element types supported by GPUIX
export type ElementType =
  | "div"
  | "text"
  | "img"
  | "svg"
  | "canvas"
  | "input"
  | "anchored"
  | "code"
  | "diff"
  | "markdown"

// ── Theme ────────────────────────────────────────────────────────────

/** Colours for one syntax capture class each. Every field is a CSS colour. */
export interface SyntaxTheme {
  comment?: string
  keyword?: string
  string?: string
  stringSpecial?: string
  escape?: string
  number?: string
  boolean?: string
  typeName?: string
  typeBuiltin?: string
  constructor?: string
  function?: string
  functionBuiltin?: string
  macroName?: string
  property?: string
  constant?: string
  variable?: string
  variableSpecial?: string
  parameter?: string
  operator?: string
  punctuation?: string
  tag?: string
  attribute?: string
  label?: string
  invalid?: string
}

/**
 * Every number that decides layout in the native text components.
 *
 * These live in the theme, not in Rust constants, so tuning a row height or a
 * heading scale is a React re-render and needs no native rebuild.
 */
export interface GpuixMetrics {
  // Code blocks
  codeTextSize?: number
  codeLineHeight?: number
  codePaddingX?: number
  codePaddingY?: number
  codeRadius?: number
  codeHeaderPaddingY?: number
  codeHeaderTextSize?: number
  codeGutterDigitWidth?: number
  codeGutterPaddingRight?: number
  codeGutterMinWidth?: number

  // Diffs
  diffTextSize?: number
  diffLineHeight?: number
  diffFileHeaderHeight?: number
  diffHunkHeaderHeight?: number
  diffNoticeHeight?: number
  diffBodyBottomPad?: number
  diffGutterWidth?: number
  diffMarkerWidth?: number
  diffAccentBarWidth?: number
  diffRowPaddingX?: number

  // Markdown
  mdTextSize?: number
  mdLineHeight?: number
  mdBlockGap?: number
  /** `[h1, h2, h3, h4to6]`. A shorter array leaves the rest at their defaults. */
  mdHeadingSizes?: number[]
  mdHeadingLineHeights?: number[]
  mdTableCellPadding?: number
  mdTableMinColumnWidth?: number
  mdTableMinColumnContent?: number
  mdInlineCodeRadius?: number
}

/**
 * Theme tokens for the native text components. Every field is optional and
 * layers on top of the built-in dark theme (or light, via `appearance`).
 */
export interface GpuixTheme {
  appearance?: "dark" | "light"
  bg?: string
  border?: string
  text?: string
  textMuted?: string
  textFaint?: string
  textDim?: string
  accent?: string
  codeText?: string
  codeWash?: string
  diffAdd?: string
  diffDel?: string
  diffHunkBg?: string
  fontSans?: string
  fontMono?: string
  syntax?: SyntaxTheme
  metrics?: GpuixMetrics
}

// Props passed to elements.
// Element IDs are auto-generated numeric IDs (not user-settable).
// Use React refs to get an element's ID: ref.current.id
export type Props = Record<string, unknown> & {
  style?: StyleDesc
  children?: React.ReactNode

  // ── Mouse events ───────────────────────────────────────────────
  onClick?: (event: EventPayload) => void
  onMouseDown?: (event: EventPayload) => void
  onMouseUp?: (event: EventPayload) => void
  onMouseEnter?: (event: EventPayload) => void
  onMouseLeave?: (event: EventPayload) => void
  onMouseMove?: (event: EventPayload) => void
  /** Fires when user clicks OUTSIDE this element. Use for "click outside to close". */
  onMouseDownOutside?: (event: EventPayload) => void

  // ── Keyboard events (need focus: autoFocus, or a click on the element) ──
  onKeyDown?: (event: EventPayload) => void
  onKeyUp?: (event: EventPayload) => void

  // ── Focus events ───────────────────────────────────────────────
  onFocus?: (event: EventPayload) => void
  onBlur?: (event: EventPayload) => void

  // ── Scroll events ──────────────────────────────────────────────
  onScroll?: (event: EventPayload) => void

  // ── Focus props ────────────────────────────────────────────────
  /** Take keyboard focus when the element first mounts. Required for `<input>`:
   *  without it, or a click, the field never receives key events. */
  autoFocus?: boolean
}

// Props for the <input> custom element (controlled component).
export interface InputProps extends Props {
  value?: string
  placeholder?: string
  readOnly?: boolean
}

// Props for native <img> rendering.
export interface ImgProps extends Props {
  src?: string
  objectFit?: "fill" | "contain" | "cover" | "scaleDown" | "none"
  alt?: string
}

// Props for the <code> custom element — a syntax-highlighted code block.
export interface CodeProps extends Props {
  /** The source to display. Rendered one div per line at an exact line height. */
  code?: string
  /** Language alias such as "ts", "rust", "bash". Beats `path` for detection. */
  language?: string
  /** File path, used for extension-based language detection. */
  path?: string
  showLineNumbers?: boolean
  /** Header strip with the language tag. Defaults to true when `language` is set. */
  showHeader?: boolean
  theme?: GpuixTheme
}

// Props for the <diff> custom element — a virtualized unified diff viewer.
export interface DiffProps extends Props {
  /** A unified git patch (the output of `git diff`). */
  patch?: string
  /** Highlight the words that changed inside paired +/- lines. */
  wordDiff?: boolean
  /** File paths rendered as a header only. Collapsed bodies cost one row. */
  collapsedPaths?: string[]
  theme?: GpuixTheme
  /** Fires when a file header is clicked. `event.value` is the file path. */
  onToggleFile?: (event: EventPayload) => void
  /** Fires when a diff line is clicked. `event.value` is the line text,
   *  `event.oldLine` / `event.newLine` are its line numbers. */
  onLineClick?: (event: EventPayload) => void
}

// Props for the <markdown> custom element.
export interface MarkdownProps extends Props {
  /** GitHub-flavoured markdown. Tables, strikethrough and task lists are on. */
  source?: string
  theme?: GpuixTheme
  /** Fires when a block containing links is clicked. `event.value` is the URL. */
  onLinkClick?: (event: EventPayload) => void
}

// Props for the <anchored> custom element.
export interface AnchoredProps extends Props {
  x?: number
  y?: number
  position?: { x: number; y: number }
  anchor?: "topLeft" | "topRight" | "bottomLeft" | "bottomRight"
  snapToWindow?: boolean
  snapMargin?: number
  deferred?: boolean
  priority?: number
}

/// Interface for the renderer that receives mutations from the reconciler.
/// Implemented by the real napi GpuixRenderer and by TestRenderer (which
/// delegates to native TestGpuixRenderer for tests).
export interface NativeRenderer {
  createElement(id: number, elementType: string): void
  destroyElement(id: number): Array<number>
  appendChild(parentId: number, childId: number): void
  removeChild(parentId: number, childId: number): void
  insertBefore(parentId: number, childId: number, beforeId: number): void
  setStyle(id: number, styleJson: string): void
  setText(id: number, content: string): void
  setEventListener(id: number, eventType: string, hasHandler: boolean): void
  setRoot(id: number): void
  commitMutations(): void
  setCustomProp(id: number, key: string, valueJson: string): void
  /** Apply a batch of mutations in a single FFI call. Returns destroyed IDs. */
  applyBatch?(json: string): Array<number>

  // ── Scroll API ─────────────────────────────────────────────────
  /** Set the scroll offset of a scrollable element (overflow: "scroll").
   *  x and y are negative pixel values (scroll down = more negative y). */
  scrollTo?(elementId: number, x: number, y: number): void
  /** Scroll a child into view by its index in the children list. */
  scrollToItem?(elementId: number, index: number): void
  /** Get the current scroll offset [x, y] or null if element is not scrollable. */
  getScrollOffset?(elementId: number): Array<number> | null

  // ── Selection API ──────────────────────────────────────────────
  /** The current text selection joined in document order, or null. */
  getSelectedText?(): string | null
  /** Drop the current selection. */
  clearSelection?(): void
}

// Container holds the renderer reference.
// Mutations go directly via napi calls.
export interface Container {
  renderer: NativeRenderer
}

// Instance — minimal handle for React's reconciler.
// The real element state lives in Rust's RetainedTree.
export interface Instance {
  id: number
  type: ElementType
  props: Props
}

// Text instance for raw text nodes
export interface TextInstance {
  id: number
  text: string
  parentId: number | null
}

// Public instance exposed via refs
export type PublicInstance = Instance

// Host context passed down the tree
export interface HostContext {
  isInsideText: boolean
}
