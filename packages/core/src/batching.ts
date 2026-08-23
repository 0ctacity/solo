/// BatchingRenderer — buffers individual napi mutation calls into a single
/// applyBatch() FFI call, reducing N FFI boundary crossings to 1 per commit.
///
/// Queue raw objects for setStyle / setCustomProp. Do not JSON.stringify them
/// first. The outer applyBatch stringify would escape that string again, and
/// Rust would parse twice. A 10k-row mount spent 626ms in applyBatch that way.
///
/// Implemented as a JS Proxy: mutation method calls on the NativeRenderer are
/// captured as ["methodName", ...args] in a queue. On commitMutations(), the
/// entire queue is flushed via applyBatch(json).
///
/// Adding a new mutation method to NativeRenderer requires adding it to
/// BATCHED_METHODS below — nothing else.
///
/// ## Batch timing
///
/// The batch boundary is the framework's commit phase:
///
///   state change → framework render → mutation callbacks → commit end
///                                ↓ each callback queues ops  ↓ flushes queue
///                                queue.push([name, ...args]) applyBatch(json)
///
/// Multiple updates batched by the framework into one render = one batch.
/// Multiple separate commits in the same event loop tick = multiple batches.

import type { NativeRenderer } from "./types.js"
import { unregisterEventHandlers } from "./event-registry.js"

export type MutationTuple = (number | string | boolean | object | null)[]

/// Methods that should be batched (queued instead of called immediately).
/// Any method NOT in this set is passed through to the inner renderer directly.
/// This prevents accidental queuing of getters, queries, or future non-mutation
/// methods that would return undefined and enqueue garbage ops.
const BATCHED_METHODS = new Set([
  "createElement",
  "appendChild",
  "removeChild",
  "insertBefore",
  "setStyle",
  "setText",
  "setEventListener",
  "setRoot",
  "setCustomProp",
])

/**
 * Wrap a NativeRenderer with batching support.
 *
 * If the inner renderer has applyBatch(), returns a Proxy that buffers
 * all mutation calls and flushes them in one applyBatch() per commit.
 * setCustomProp is queued as setCustomPropValue so raw strings stay strings.
 * Without applyBatch, style and custom-prop objects are stringified for the
 * string-only napi methods.
 */
export function wrapWithBatching(inner: NativeRenderer): NativeRenderer {
  if (typeof inner.applyBatch !== "function") {
    return new Proxy(inner, {
      get(target, prop: string) {
        if (prop === "setStyle") {
          return (id: number, style: string | object) => {
            target.setStyle(id, typeof style === "string" ? style : JSON.stringify(style))
          }
        }
        if (prop === "setCustomProp") {
          return (
            id: number,
            key: string,
            value: string | object | number | boolean | null,
          ) => {
            target.setCustomProp(id, key, JSON.stringify(value ?? null))
          }
        }
        const method = (target as NativeRenderer & Record<string, unknown>)[prop]
        if (typeof method === "function") {
          return method.bind(target)
        }
        return method
      },
    })
  }

  const batchable = inner as NativeRenderer & { applyBatch(json: string): number[] }
  let queue: MutationTuple[] = []

  return new Proxy(inner, {
    get(_target, prop: string) {
      // commitMutations: flush the queue via a single applyBatch() FFI call.
      // Called by the framework at the end of its commit phase.
      if (prop === "commitMutations") {
        return () => {
          if (queue.length === 0) {
            batchable.commitMutations()
            return
          }

          const json = JSON.stringify(queue)

          // applyBatch may throw on malformed ops — queue is preserved
          // on failure so state doesn't desync between JS and Rust.
          const destroyedIds = batchable.applyBatch(json)

          // Clean up JS-side event handlers immediately after successful batch.
          for (const id of destroyedIds) {
            unregisterEventHandlers(id)
          }

          // applyBatch already invalidates, so only clear after batch + cleanup.
          queue = []
        }
      }

      // destroyElement: queue the op, return [] (destroyed IDs come from applyBatch).
      if (prop === "destroyElement") {
        return (id: number): Array<number> => {
          queue.push(["destroyElement", id])
          return []
        }
      }

      if (prop === "setCustomProp") {
        return (...args: MutationTuple) => {
          queue.push(["setCustomPropValue", ...args])
        }
      }

      // Batched mutation methods: queue as [methodName, ...args].
      if (BATCHED_METHODS.has(prop)) {
        return (...args: MutationTuple) => {
          queue.push([prop, ...args])
        }
      }

      // Everything else (getters, queries, applyBatch, future methods):
      // pass through to the inner renderer directly.
      const value = (batchable as any)[prop]
      if (typeof value === "function") {
        return value.bind(batchable)
      }
      return value
    },
  })
}
