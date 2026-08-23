/// Solid 2 runtime for GPUIX.
///
/// This is the `moduleName` target for babel-preset-solid compiled with
/// `{ generate: "universal", moduleName: "@gpuix/solid/runtime" }`. The
/// compiler emits calls against the functions re-exported here, and each one
/// maps onto the native mutation protocol (createElement / appendChild /
/// insertBefore / setText / setStyle / setEventListener / setCustomProp /
/// commitMutations) through @gpuix/core's NativeRenderer interface.
///
/// Fine-grained updates stay fine-grained: a signal-driven text change only
/// produces a single `setText` op in the next batch, never a tree rebuild.

import { createRenderer } from "@solidjs/universal"
import { flush } from "solid-js"
import { For, Show, Switch, Match, Repeat, Reveal, Loading } from "solid-js"
import type { Element as SolidElement } from "solid-js"
import type { EventPayload } from "@gpuix/native"
import {
  attachEventHandler,
  clearEventHandlers,
  gpuixEventTypeForProp,
  wrapWithBatching,
} from "@gpuix/core"
import type { NativeRenderer, StyleDesc } from "@gpuix/core"

// ── Node bookkeeping ─────────────────────────────────────────────────

export interface GpuixSolidNode {
  id: number
  /** Native element type ("div", "text", "img", ...). */
  type: string
  isText: boolean
  parent: GpuixSolidNode | null
  children: GpuixSolidNode[]
}

let idCounter = 0

/** Reset element IDs so tests are deterministic. */
export function resetIdCounter(): void {
  idCounter = 0
}

function nextId(): number {
  return ++idCounter
}

// ── Active renderer ──────────────────────────────────────────────────

let activeRenderer: NativeRenderer | null = null
let flushNow: (() => void) | null = null

/**
 * Set the renderer all ops go to. Called by render()/mount().
 * Mutations are buffered by wrapWithBatching() and flushed with one
 * applyBatch() per microtask: every queued mutation arms exactly one commit,
 * so everything a reactive transaction mutates lands in a single batch.
 */
export function setGpuixRenderer(renderer: NativeRenderer): void {
  const batched = wrapWithBatching(renderer)
  let scheduled = false
  const armCommit = (): void => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      // Solid 2 may defer reaction re-runs to a microtask; drain them first
      // so the batch contains every op from this transaction.
      flush()
      batched.commitMutations()
    })
  }

  activeRenderer = new Proxy(batched, {
    get(target, prop) {
      if (prop === "commitMutations") return () => armCommit()
      if (
        prop === "createElement" ||
        prop === "destroyElement" ||
        prop === "appendChild" ||
        prop === "removeChild" ||
        prop === "insertBefore" ||
        prop === "setStyle" ||
        prop === "setText" ||
        prop === "setEventListener" ||
        prop === "setCustomProp"
      ) {
        return (...args: unknown[]) => {
          ;(target as unknown as Record<string, (...a: unknown[]) => unknown>)[prop](...args)
          armCommit()
          if (prop === "destroyElement") return []
        }
      }
      const value = Reflect.get(target, prop)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  // Immediate flush bypasses (and cancels) the microtask schedule.
  flushNow = () => {
    scheduled = false
    flush()
    batched.commitMutations()
  }
}

export function getGpuixRenderer(): NativeRenderer {
  if (!activeRenderer) throw new Error("GPUIX renderer not set. Call render() first.")
  return activeRenderer
}

/** Run pending Solid reactions and flush queued mutations immediately. */
export function flushMutations(): void {
  flushNow?.()
}

// ── Renderer ops → native mutations ──────────────────────────────────

const NATIVE_TYPES = new Set([
  "div",
  "text",
  "img",
  "svg",
  "canvas",
  "input",
  "textarea",
  "anchored",
  "code",
  "diff",
  "markdown",
  "virtual-list",
])

function applyProps(node: GpuixSolidNode, props: Record<string, unknown>): void {
  for (const name of Object.keys(props)) {
    setProperty(node, name, props[name])
  }
}

export function createElement(tag: string, staticProps?: Record<string, unknown>): GpuixSolidNode {
  const r = getGpuixRenderer()
  const node: GpuixSolidNode = {
    id: nextId(),
    type: NATIVE_TYPES.has(tag) ? tag : "div",
    isText: false,
    parent: null,
    children: [],
  }
  r.createElement(node.id, node.type)
  // Solid 2 passes static (non-reactive) props at creation instead of via
  // setProp calls afterwards.
  if (staticProps) applyProps(node, staticProps)
  return node
}

export function createTextNode(value: string | number): GpuixSolidNode {
  const r = getGpuixRenderer()
  const node: GpuixSolidNode = {
    id: nextId(),
    type: "text",
    isText: true,
    parent: null,
    children: [],
  }
  r.createElement(node.id, "text")
  // Solid 2 passes numbers straight through; native wants strings.
  r.setText(node.id, String(value))
  return node
}

function replaceText(node: GpuixSolidNode, value: string | number): void {
  getGpuixRenderer().setText(node.id, String(value))
}

/**
 * Insert `node` into `parent` before `anchor` (or appended when omitted).
 * Maps to appendChild / insertBefore on the retained tree.
 */
export function insertNode(parent: GpuixSolidNode, node: GpuixSolidNode, anchor?: GpuixSolidNode): void {
  const r = getGpuixRenderer()
  // Detach from any previous parent first (the retained tree requires it).
  if (node.parent) {
    const oldChildren = node.parent.children
    const index = oldChildren.indexOf(node)
    if (index !== -1) oldChildren.splice(index, 1)
    if (node.parent.id !== parent.id || anchor) {
      r.removeChild(node.parent.id, node.id)
    }
    node.parent = null
  }
  if (anchor != null && anchor.parent === parent) {
    const index = parent.children.indexOf(anchor)
    parent.children.splice(index, 0, node)
    r.insertBefore(parent.id, node.id, anchor.id)
  } else {
    parent.children.push(node)
    r.appendChild(parent.id, node.id)
  }
  node.parent = parent
}

function removeNode(parent: GpuixSolidNode, node: GpuixSolidNode): void {
  const r = getGpuixRenderer()
  const index = parent.children.indexOf(node)
  if (index !== -1) parent.children.splice(index, 1)
  node.parent = null
  // destroyElement also destroys descendants; the batching layer unregisters
  // their event handlers from the returned destroyed-ID list after flush.
  r.removeChild(parent.id, node.id)
  r.destroyElement(node.id)
}

function setProperty(
  node: GpuixSolidNode,
  name: string,
  value: unknown,
  prev?: unknown
): void {
  const r = getGpuixRenderer()
  if (name === "style") {
    if (value != null && typeof value === "object") {
      r.setStyle(node.id, value as StyleDesc)
    } else if (prev != null) {
      r.setStyle(node.id, {})
    }
    return
  }
  const eventType = gpuixEventTypeForProp(name)
  if (eventType) {
    attachEventHandler(r, node.id, eventType, value as ((e: EventPayload) => void) | null)
    return
  }
  if (value === prev) return
  r.setCustomProp(
    node.id,
    name,
    (value === undefined ? null : value) as string | object | number | boolean | null
  )
}

const getParentNode = (node: GpuixSolidNode): GpuixSolidNode | undefined => node.parent ?? undefined
const getFirstChild = (node: GpuixSolidNode): GpuixSolidNode | undefined => node.children[0]
function getNextSibling(node: GpuixSolidNode): GpuixSolidNode | undefined {
  const siblings = node.parent?.children
  if (!siblings) return undefined
  return siblings[siblings.indexOf(node) + 1]
}

// ── Universal renderer ───────────────────────────────────────────────

export const universal = createRenderer<GpuixSolidNode>({
  createElement,
  createTextNode,
  replaceText,
  isTextNode: (node) => node.isText,
  setProperty,
  insertNode,
  removeNode,
  getParentNode,
  getFirstChild,
  getNextSibling,
})

// Re-exported under the exact names babel-preset-solid emits. Compiled JSX
// does `import { createElement, insertNode, ... } from "@gpuix/solid/runtime"`
// — these must be named exports of this module.
export const insert = universal.insert
export const spread = universal.spread
export const setProp = universal.setProp
export const effect = universal.effect
export const memo = universal.memo
export const applyRef = universal.applyRef
export const ref = universal.ref
export const mergeProps = universal.mergeProps


export function createComponent<T>(comp: (props: T) => unknown, props: T): unknown {
  return universal.createComponent(comp as never, props)
}

// Control flow lives in core solid-js; the compiled output imports it from
// this module.
export { For, Show, Switch, Match, Repeat, Reveal, Loading }

// ── Root mounting (container-style render, no window ownership) ──────

/**
 * Mount `code` into a fresh root div on the given renderer and return a
 * disposer. Used by the public render() and by tests. The initial batch is
 * committed synchronously before returning.
 */
export function mount(
  code: () => SolidElement,
  renderer: NativeRenderer
): () => void {
  setGpuixRenderer(renderer)
  const rootNode = createElement("div")
  renderer.setRoot(rootNode.id)
  const solidDispose = universal.render(code as unknown as () => GpuixSolidNode, rootNode)
  const dispose = (): void => {
    // The universal disposer removes mounted nodes through our removeNode op.
    solidDispose()
    getGpuixRenderer().destroyElement(rootNode.id)
    flushNow?.()
    clearEventHandlers()
  }
  flushNow?.()
  return dispose
}
