import { describe, expect, it } from "vitest"
import { createRoot, createStore } from "solid-js"
import { MockNativeRenderer } from "@solo/core"
import { findByTestId, mountTest } from "../test-utils.js"
import {
  createElement,
  flushMutations,
  insert,
  rowProof,
  setSoloRenderer,
  setProp,
  type SoloSolidNode,
} from "../runtime.js"

interface Row {
  id: string
  title: string
}

interface PatchListAccessor extends Function {
  $ll: {
    each: () => Row[]
    row: (row: Row) => SoloSolidNode
    keyed?: boolean | ((row: Row) => unknown)
  }
}

describe("RC.4 patch list driver", () => {
  it("intercepts a proven store list instead of evaluating the classic accessor", () => {
    let classicCalls = 0

    const t = mountTest(() => {
      const [rows] = createStore<Row[]>([
        { id: "one", title: "One" },
        { id: "two", title: "Two" },
      ])
      const parent = createElement("div")
      const list = (() => {
        classicCalls++
        throw new Error("classic reconciliation should not run")
      }) as PatchListAccessor
      list.$ll = {
        each: () => rows,
        row: rowProof((row) => {
          const node = createElement("div")
          setProp(node, "testId", row.id)
          return node
        }),
      }
      insert(parent, list)
      return parent
    })

    try {
      expect(classicCalls).toBe(0)
      expect(findByTestId(t.renderer, "one")).toBeDefined()
      expect(findByTestId(t.renderer, "two")).toBeDefined()
    } finally {
      t.unmount()
    }
  })

  it("destroys every row node created before a row build throws", () => {
    const renderer = new MockNativeRenderer()
    setSoloRenderer(renderer)
    let parent: SoloSolidNode | undefined

    expect(() =>
      createRoot(() => {
        const [rows] = createStore<Row[]>([
          { id: "good", title: "Good" },
          { id: "bad", title: "Bad" },
        ])
        parent = createElement("div")
        const list = (() => []) as PatchListAccessor
        list.$ll = {
          each: () => rows,
          row: rowProof((row) => {
            const node = createElement("div")
            setProp(node, "testId", row.id)
            if (row.id === "bad") throw new Error("row build failed")
            return node
          }),
        }
        insert(parent, list)
      }),
    ).toThrow("row build failed")

    flushMutations()
    expect(parent).toBeDefined()
    expect([...renderer.elements.keys()]).toEqual([parent!.id])
  })
})
