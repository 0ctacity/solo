/// Public, framework-level controls for a mounted `<webview>`.
///
/// The controller intentionally contains no AppKit/WebKit types. Native
/// renderers return a JSON string over the private mutation bridge; this
/// module validates and decodes it into the small JSON-compatible value space
/// applications can safely consume.

import type { NativeRenderer } from "@solo/core"
import type { EventPayload } from "@solo/native"

export type WebviewValue =
  | string
  | number
  | boolean
  | null
  | WebviewValue[]
  | { readonly [key: string]: WebviewValue }

type PendingEvaluation = {
  reject: (reason?: unknown) => void
}

type PendingReady = {
  reject: (reason?: unknown) => void
}

function assertWebviewValue(value: unknown, path = "result"): asserts value is WebviewValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number") {
    if (Number.isFinite(value)) return
    throw new Error(`${path} contains a non-finite number`)
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertWebviewValue(item, `${path}[${index}]`))
    return
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertWebviewValue(item, `${path}.${key}`)
    }
    return
  }
  throw new Error(`${path} contains an unsupported value`)
}

function decodeEvaluation(value: string): WebviewValue {
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch (error) {
    throw new Error(
      `WebView JavaScript returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  assertWebviewValue(decoded)
  return decoded
}

function isWaitingForFirstPaint(error: unknown): boolean {
  return error instanceof Error && /WebView \d+ is not mounted/i.test(error.message)
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export interface WebviewController {
  /** The stable Solo element ID for this mounted WebView. */
  readonly id: number
  /** Whether this controller still refers to a mounted WebView. */
  isMounted(): boolean
  /** Resolve when the current document generation has finished loading. */
  ready(): Promise<void>
  /**
   * Evaluate an expression in the document and await Promise results.
   * `undefined` is normalized to `null`; all other results must be JSON
   * compatible (strings, finite numbers, booleans, null, arrays, or objects).
   */
  evaluateJavaScript(script: string): Promise<WebviewValue>
  /** Resolve a pending navigation request emitted by `onNavigationRequest`. */
  allowNavigation(navigationId: number): void
  /** Cancel a pending navigation request emitted by `onNavigationRequest`. */
  cancelNavigation(navigationId: number): void
}

/** A navigation initiated from inside a WebView document. */
export interface WebviewNavigationRequestEvent extends EventPayload {
  /** ID passed to `allowNavigation` or `cancelNavigation`. */
  navigationId: number
  /** Requested URL when WebKit supplied one. */
  navigationUrl?: string
  /** Fragment-only navigations are allowed automatically. */
  isSameDocument: boolean
  /** New-window requests are cancelled automatically. */
  isNewWindow: boolean
}

export interface InternalWebviewController extends WebviewController {
  invalidateDocument(reason: string): void
  dispose(): void
}

/** @internal Create the stable controller attached to one native WebView element. */
export function createWebviewController(
  id: number,
  renderer: NativeRenderer,
): InternalWebviewController {
  let mounted = true
  let generation = 0
  const pending = new Set<PendingEvaluation>()
  const pendingReady = new Set<PendingReady>()

  const controller: InternalWebviewController = {
    id,
    isMounted: () => mounted,
    ready(): Promise<void> {
      if (!mounted) return Promise.reject(new Error("WebView is unmounted"))
      const waitReady = renderer.waitWebviewReady?.bind(renderer)
      if (!waitReady) return Promise.reject(new Error("This renderer does not support WebView readiness"))

      const requestGeneration = generation
      return new Promise<void>((resolve, reject) => {
        const request: PendingReady = { reject }
        pendingReady.add(request)
        const waitForNativeView = async (): Promise<void> => {
          for (;;) {
            if (!mounted || requestGeneration !== generation) {
              throw new Error("WebView document changed before it became ready")
            }
            try {
              await waitReady(id)
              return
            } catch (error) {
              if (!isWaitingForFirstPaint(error)) throw error
              await nextTurn()
            }
          }
        }
        void waitForNativeView()
          .then(() => {
            pendingReady.delete(request)
            if (!mounted || requestGeneration !== generation) {
              reject(new Error("WebView document changed before it became ready"))
              return
            }
            resolve()
          })
          .catch((error: unknown) => {
            pendingReady.delete(request)
            reject(error)
          })
      })
    },
    evaluateJavaScript(script: string): Promise<WebviewValue> {
      if (!mounted) return Promise.reject(new Error("WebView is unmounted"))
      if (typeof script !== "string" || !script.trim()) {
        return Promise.reject(new TypeError("WebView JavaScript must be a non-empty string"))
      }
      const evaluate = renderer.evaluateWebviewJavaScript?.bind(renderer)
      if (!evaluate) return Promise.reject(new Error("This renderer does not support WebView JavaScript"))

      const requestGeneration = generation
      return new Promise<WebviewValue>((resolve, reject) => {
        const request: PendingEvaluation = { reject }
        pending.add(request)
        let nativeEvaluation: Promise<string>
        try {
          nativeEvaluation = evaluate(id, script)
        } catch (error) {
          pending.delete(request)
          reject(error)
          return
        }
        void nativeEvaluation
          .then((serialized) => {
            pending.delete(request)
            if (!mounted || requestGeneration !== generation) {
              reject(new Error("WebView document changed before JavaScript evaluation completed"))
              return
            }
            try {
              resolve(decodeEvaluation(serialized))
            } catch (error) {
              reject(error)
            }
          })
          .catch((error: unknown) => {
            pending.delete(request)
            reject(error)
          })
      })
    },
    allowNavigation(navigationId: number): void {
      if (!mounted) throw new Error("WebView is unmounted")
      if (!Number.isSafeInteger(navigationId) || navigationId < 0) {
        throw new TypeError("WebView navigation ID must be a non-negative safe integer")
      }
      const allow = renderer.allowWebviewNavigation?.bind(renderer)
      if (!allow) throw new Error("This renderer does not support WebView navigation decisions")
      allow(id, navigationId)
    },
    cancelNavigation(navigationId: number): void {
      if (!mounted) throw new Error("WebView is unmounted")
      if (!Number.isSafeInteger(navigationId) || navigationId < 0) {
        throw new TypeError("WebView navigation ID must be a non-negative safe integer")
      }
      const cancel = renderer.cancelWebviewNavigation?.bind(renderer)
      if (!cancel) throw new Error("This renderer does not support WebView navigation decisions")
      cancel(id, navigationId)
    },
    invalidateDocument(reason: string): void {
      generation += 1
      for (const request of pending) request.reject(new Error(reason))
      pending.clear()
      for (const request of pendingReady) request.reject(new Error(reason))
      pendingReady.clear()
    },
    dispose(): void {
      if (!mounted) return
      mounted = false
      controller.invalidateDocument("WebView was unmounted")
    },
  }
  return controller
}
