/// Host config for React's reconciler — mutation-based protocol.
///
/// Each reconciler callback (createInstance, appendChild, commitUpdate, etc.)
/// makes a direct napi call to the Rust retained tree. No JSON serialization
/// of the full element tree. Only changed elements cross the FFI boundary.

import { createContext } from "react"
import type { ReactContext } from "react-reconciler"
import { DefaultEventPriority } from "react-reconciler/constants.js"

const NoEventPriority = 0
import type {
  Container,
  ElementType,
  HostContext,
  Instance,
  NativeRenderer,
  Props,
  PublicInstance,
  TextInstance,
} from "../types/host.js"
import {
  registerEventHandler,
  unregisterEventHandler,
  unregisterEventHandlers,
} from "./event-registry.js"

let elementIdCounter = 0
let currentUpdatePriority = NoEventPriority

// Renderer reference — set by createRoot before any reconciler work.
let nativeRenderer: NativeRenderer | null = null

export function setNativeRenderer(renderer: NativeRenderer): void {
  nativeRenderer = renderer
}

export function resetIdCounter(): void {
  elementIdCounter = 0
}

function nextId(): number {
  return ++elementIdCounter
}

function getRenderer(): NativeRenderer {
  if (!nativeRenderer) throw new Error("GPUIX renderer not set. Call createRoot first.")
  return nativeRenderer
}

// ── Event wiring helpers ─────────────────────────────────────────────

const EVENT_PROPS = [
  // Custom element events
  ["onToggleFile", "toggleFile"],
  ["onShowMore", "showMore"],
  ["onLineClick", "lineClick"],
  ["onLinkClick", "linkClick"],
  ["onChange", "change"],
  ["onSubmit", "submit"],
  // Mouse events
  ["onClick", "click"],
  ["onMouseDown", "mouseDown"],
  ["onMouseUp", "mouseUp"],
  ["onMouseEnter", "mouseEnter"],
  ["onMouseLeave", "mouseLeave"],
  ["onMouseMove", "mouseMove"],
  ["onMouseDownOutside", "mouseDownOutside"],
  // Keyboard events (require focus — tabIndex or autoFocus)
  ["onKeyDown", "keyDown"],
  ["onKeyUp", "keyUp"],
  // Focus events
  ["onFocus", "focus"],
  ["onBlur", "blur"],
  // Scroll events
  ["onScroll", "scroll"],
] as const

const EVENT_PROP_NAMES = new Set<string>(EVENT_PROPS.map(([name]) => name))

function syncEventListeners(id: number, props: Props): void {
  const r = getRenderer()
  for (const [propName, eventType] of EVENT_PROPS) {
    const handler = props[propName]
    if (handler) {
      registerEventHandler(id, eventType, handler)
      r.setEventListener(id, eventType, true)
    }
  }
}

function diffEventListeners(id: number, oldProps: Props, newProps: Props): void {
  const r = getRenderer()
  for (const [propName, eventType] of EVENT_PROPS) {
    const oldHandler = oldProps[propName]
    const newHandler = newProps[propName]

    if (oldHandler && !newHandler) {
      // Removed — clean up both JS closure and Rust listener
      unregisterEventHandler(id, eventType)
      r.setEventListener(id, eventType, false)
    } else if (newHandler && newHandler !== oldHandler) {
      // Added or changed
      registerEventHandler(id, eventType, newHandler)
      if (!oldHandler) {
        r.setEventListener(id, eventType, true)
      }
    }
  }
}

// ── Style helper ─────────────────────────────────────────────────────

function sendStyle(id: number, props: Props): void {
  const style = props.style
  if (style == null || Object.keys(style).length === 0) return
  getRenderer().setStyle(id, style)
}

// ── Custom prop forwarding ───────────────────────────────────────────

// Props that are handled by the reconciler directly (not forwarded as custom props).
const RESERVED_PROPS = new Set(["style", "className", "children", "key", "ref"])

// Built-in element types that don't use custom props.
const BUILT_IN_TYPES = new Set(["div", "text"])

// Props that reach Rust on EVERY element type, including div and text.
// Custom props are otherwise skipped for built-ins.
const UNIVERSAL_PROPS = new Set(["autoFocus", "tabIndex", "motion"])

function isReservedProp(name: string): boolean {
  return RESERVED_PROPS.has(name) || EVENT_PROP_NAMES.has(name)
}

function serializeCustomProp(
  _type: string,
  _key: string,
  value: object | string | number | boolean | null | undefined
): string | object | number | boolean | null {
  if (value === undefined || typeof value === "function") return null
  return value
}

/** Send all custom props to Rust for non-built-in element types. */
function syncCustomProps(id: number, type: string, props: Props): void {
  const builtIn = BUILT_IN_TYPES.has(type)
  const r = getRenderer()
  for (const [key, value] of Object.entries(props)) {
    if (isReservedProp(key)) continue
    if (builtIn && !UNIVERSAL_PROPS.has(key)) continue
    r.setCustomProp(id, key, serializeCustomProp(type, key, value))
  }
}

/** Diff and send changed custom props to Rust. */
function diffCustomProps(
  id: number,
  type: string,
  oldProps: Props,
  newProps: Props
): void {
  const builtIn = BUILT_IN_TYPES.has(type)
  const r = getRenderer()
  const oldEntries = Object.entries(oldProps)
  const newKeys = Object.keys(newProps)
  // Updated or added props
  for (const [key, value] of Object.entries(newProps)) {
    if (isReservedProp(key)) continue
    if (builtIn && !UNIVERSAL_PROPS.has(key)) continue
    const oldValue = oldEntries.find(([oldKey]) => oldKey === key)?.[1]
    if (oldValue !== value) {
      r.setCustomProp(id, key, serializeCustomProp(type, key, value))
    }
  }
  // Removed props
  for (const key of Object.keys(oldProps)) {
    if (isReservedProp(key)) continue
    if (builtIn && !UNIVERSAL_PROPS.has(key)) continue
    if (!newKeys.includes(key)) {
      r.setCustomProp(id, key, JSON.stringify(null))
    }
  }
}

// ── Host config ──────────────────────────────────────────────────────

export const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,

  // NOTE: createInstance is called during React's RENDER phase, not the commit
  // phase. In concurrent mode, React can abandon a render and retry — mutations
  // from abandoned renders stay in the batch queue and get flushed with the next
  // successful commit, potentially creating orphaned elements in Rust's retained
  // tree. This is a pre-existing issue (pre-batching, calls went directly to
  // native with the same orphan risk). Proper fix: defer element creation to
  // commit phase callbacks.
  createInstance(
    type: ElementType,
    props: Props,
    _rootContainerInstance: Container,
    _hostContext: HostContext
  ): Instance {
    const id = nextId()
    const r = getRenderer()
    r.createElement(id, type)
    sendStyle(id, props)
    syncEventListeners(id, props)
    syncCustomProps(id, type, props)
    return { id, type, props }
  },

  appendChild(parent: Instance, child: Instance | TextInstance): void {
    getRenderer().appendChild(parent.id, child.id)
  },

  removeChild(parent: Instance, child: Instance | TextInstance): void {
    getRenderer().removeChild(parent.id, child.id)
  },

  insertBefore(
    parent: Instance,
    child: Instance | TextInstance,
    beforeChild: Instance | TextInstance
  ): void {
    getRenderer().insertBefore(parent.id, child.id, beforeChild.id)
  },

  insertInContainerBefore(
    _parent: Container,
    _child: Instance,
    _beforeChild: Instance
  ): void {},

  removeChildFromContainer(_parent: Container, child: Instance): void {
    const destroyed = getRenderer().destroyElement(child.id)
    for (const id of destroyed) {
      unregisterEventHandlers(id)
    }
  },

  prepareForCommit(_containerInfo: Container): Record<string, unknown> | null {
    return null
  },

  // Batch flush point: commitMutations() sends all queued mutations to Rust
  // in a single applyBatch() FFI call. This is the end of React's synchronous
  // commit phase — all mutations from this render are flushed together.
  resetAfterCommit(_containerInfo: Container): void {
    getRenderer().commitMutations()
  },

  getRootHostContext(_rootContainerInstance: Container): HostContext {
    return { isInsideText: false }
  },

  getChildHostContext(
    parentHostContext: HostContext,
    type: ElementType,
    _rootContainerInstance: Container
  ): HostContext {
    const isInsideText = type === "text"
    return { ...parentHostContext, isInsideText }
  },

  shouldSetTextContent(_type: ElementType, _props: Props): boolean {
    return false
  },

  createTextInstance(
    text: string,
    _rootContainerInstance: Container,
    _hostContext: HostContext
  ): TextInstance {
    const id = nextId()
    const r = getRenderer()
    r.createElement(id, "text")
    r.setText(id, text)
    return { id, text, parentId: null }
  },

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,

  shouldAttemptEagerTransition(): boolean {
    return false
  },

  finalizeInitialChildren(
    _instance: Instance,
    _type: ElementType,
    _props: Props,
    _rootContainerInstance: Container,
    _hostContext: HostContext
  ): boolean {
    return false
  },

  commitMount(
    _instance: Instance,
    _type: ElementType,
    _props: Props,
    _internalInstanceHandle: unknown
  ): void {},

  commitUpdate(
    instance: Instance,
    _type: ElementType,
    oldProps: Props,
    newProps: Props,
    _internalInstanceHandle: unknown
  ): void {
    // Always resend style — per-element JSON is small, and this avoids
    // bugs from same-reference mutations or style removal.
    getRenderer().setStyle(instance.id, newProps.style ?? {})
    // Event diff
    diffEventListeners(instance.id, oldProps, newProps)
    // Custom prop diff (for non-div/text elements)
    diffCustomProps(instance.id, instance.type, oldProps, newProps)
    instance.props = newProps
  },

  commitTextUpdate(
    textInstance: TextInstance,
    _oldText: string,
    newText: string
  ): void {
    getRenderer().setText(textInstance.id, newText)
    textInstance.text = newText
  },

  appendChildToContainer(container: Container, child: Instance): void {
    container.renderer.setRoot(child.id)
  },

  appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
    getRenderer().appendChild(parent.id, child.id)
  },

  hideInstance(instance: Instance): void {
    getRenderer().setStyle(instance.id, { visibility: "hidden" })
  },

  unhideInstance(instance: Instance, _props: Props): void {
    getRenderer().setStyle(instance.id, instance.props.style ?? {})
  },

  hideTextInstance(_textInstance: TextInstance): void {},
  unhideTextInstance(_textInstance: TextInstance, _text: string): void {},

  clearContainer(_container: Container): void {},

  setCurrentUpdatePriority(newPriority: number): void {
    currentUpdatePriority = newPriority
  },

  getCurrentUpdatePriority: (): number => currentUpdatePriority,

  resolveUpdatePriority(): number {
    if (currentUpdatePriority !== NoEventPriority) {
      return currentUpdatePriority
    }
    return DefaultEventPriority
  },

  maySuspendCommit(): boolean {
    return false
  },

  NotPendingTransition: null,
  HostTransitionContext: createContext(null) as unknown as ReactContext<null>,
  resetFormInstance(): void {},
  requestPostPaintCallback(): void {},
  trackSchedulerEvent(): void {},

  resolveEventType(): null {
    return null
  },

  resolveEventTimeStamp(): number {
    return -1.1
  },

  preloadInstance(): boolean {
    return true
  },

  startSuspendingCommit(): void {},
  suspendInstance(): void {},

  waitForCommitToBeReady(): null {
    return null
  },

  detachDeletedInstance(instance: Instance): void {
    const destroyed = getRenderer().destroyElement(instance.id)
    for (const id of destroyed) {
      unregisterEventHandlers(id)
    }
  },

  getPublicInstance(instance: Instance): PublicInstance {
    return instance
  },

  preparePortalMount(_containerInfo: Container): void {},
  isPrimaryRenderer: true,

  getInstanceFromNode(): null {
    return null
  },

  beforeActiveInstanceBlur(): void {},
  afterActiveInstanceBlur(): void {},
  prepareScopeUpdate(): void {},

  getInstanceFromScope(): null {
    return null
  },
}
