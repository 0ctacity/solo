import { describe, expect, it } from "vitest"
import { createSignal, createStore, For } from "solid-js"
import { flushMutations } from "../runtime.js"
import { findByTestId, mountTest } from "../test-utils.js"

interface Row {
  id: string
  title: string
}

interface FixtureApi {
  append(row: Row): void
  remove(index: number): void
  moveLastToFront(): void
  replace(index: number, row: Row): void
  removeAndKeep(index: number): void
  mutateRemoved(title: string): void
}

function PatchListFixture(props: {
  rows: Row[]
  shallow?: boolean
  onReady(api: FixtureApi): void
}) {
  const [rows, setRows] = createStore<Row[]>(props.rows, { shallow: props.shallow })
  let removed: Row | undefined
  props.onReady({
    append: (row) => setRows((draft) => void draft.push(row)),
    remove: (index) => setRows((draft) => void draft.splice(index, 1)),
    moveLastToFront: () =>
      setRows((draft) => {
        const last = draft.pop()
        if (last) draft.unshift(last)
      }),
    replace: (index, row) => setRows((draft) => void (draft[index] = row)),
    removeAndKeep: (index) => {
      removed = rows[index]
      setRows((draft) => void draft.splice(index, 1))
    },
    mutateRemoved: (title) =>
      setRows(() => {
        if (removed) removed.title = title
      }),
  })
  return (
    <div testId="rows">
      <For each={rows}>
        {(row) => <div testId={row.id} title={row.title}>row</div>}
      </For>
    </div>
  )
}

function mountRows(rows: Row[], shallow = false) {
  let api: FixtureApi | undefined
  const mounted = mountTest(() => (
    <PatchListFixture rows={rows} shallow={shallow} onReady={(value) => (api = value)} />
  ))
  if (!api) throw new Error("fixture did not initialize")
  mounted.renderer.drainOps()
  return { ...mounted, api }
}

function mutationOps(renderer: ReturnType<typeof mountRows>["renderer"]) {
  return renderer.ops.filter(([name]) => name !== "commitMutations")
}

describe("compiled RC.4 patch list behavior", () => {
  it("appends one row without rebuilding existing identities", () => {
    const t = mountRows([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ])
    try {
      const a = findByTestId(t.renderer, "a")!.id
      const b = findByTestId(t.renderer, "b")!.id
      t.api.append({ id: "c", title: "C" })
      flushMutations()

      expect(findByTestId(t.renderer, "a")!.id).toBe(a)
      expect(findByTestId(t.renderer, "b")!.id).toBe(b)
      expect(findByTestId(t.renderer, "c")).toBeDefined()
      expect(mutationOps(t.renderer).filter(([name]) => name === "createElement")).toHaveLength(2)
      expect(mutationOps(t.renderer).filter(([name]) => name === "appendChild")).toHaveLength(2)
      expect(mutationOps(t.renderer).filter(([name]) => name === "removeChild")).toHaveLength(0)
    } finally {
      t.unmount()
    }
  })

  it("splices one row and preserves both neighbors", () => {
    const t = mountRows([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ])
    try {
      const a = findByTestId(t.renderer, "a")!.id
      const b = findByTestId(t.renderer, "b")!.id
      const c = findByTestId(t.renderer, "c")!.id
      t.api.remove(1)
      flushMutations()

      expect(findByTestId(t.renderer, "a")!.id).toBe(a)
      expect(findByTestId(t.renderer, "b")).toBeUndefined()
      expect(findByTestId(t.renderer, "c")!.id).toBe(c)
      expect(mutationOps(t.renderer).filter(([name]) => name === "createElement")).toHaveLength(0)
      expect(mutationOps(t.renderer)).toContainEqual(["removeChild", expect.any(Number), b])
      expect(mutationOps(t.renderer)).toContainEqual(["destroyElement", b])
    } finally {
      t.unmount()
    }
  })

  it("moves only the non-LIS row for a keyed reorder", () => {
    const t = mountRows([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
      { id: "d", title: "D" },
    ])
    try {
      const identities = new Map(
        ["a", "b", "c", "d"].map((id) => [id, findByTestId(t.renderer, id)!.id]),
      )
      t.api.moveLastToFront()
      flushMutations()

      for (const [id, node] of identities) {
        expect(findByTestId(t.renderer, id)!.id).toBe(node)
      }
      expect(mutationOps(t.renderer).filter(([name]) => name === "createElement")).toHaveLength(0)
      expect(mutationOps(t.renderer).filter(([name]) => name === "insertBefore")).toHaveLength(1)
      expect(mutationOps(t.renderer).filter(([name]) => name === "removeChild")).toHaveLength(1)
    } finally {
      t.unmount()
    }
  })

  it("rebuilds only a replaced row in a shallow store", () => {
    const t = mountRows(
      [
        { id: "a", title: "A" },
        { id: "b", title: "B" },
        { id: "c", title: "C" },
      ],
      true,
    )
    try {
      const a = findByTestId(t.renderer, "a")!.id
      const b = findByTestId(t.renderer, "b")!.id
      const c = findByTestId(t.renderer, "c")!.id
      t.api.replace(1, { id: "b2", title: "B2" })
      flushMutations()

      expect(findByTestId(t.renderer, "a")!.id).toBe(a)
      expect(findByTestId(t.renderer, "b")).toBeUndefined()
      expect(findByTestId(t.renderer, "b2")!.id).not.toBe(b)
      expect(findByTestId(t.renderer, "c")!.id).toBe(c)
      expect(mutationOps(t.renderer).filter(([name]) => name === "createElement")).toHaveLength(2)
      expect(mutationOps(t.renderer)).toContainEqual(["destroyElement", b])
    } finally {
      t.unmount()
    }
  })

  it("matches duplicate identities by occurrence without rebuilding", () => {
    const shared = { id: "same", title: "Same" }
    const other = { id: "other", title: "Other" }
    const t = mountRows([shared, other, shared])
    try {
      const parent = findByTestId(t.renderer, "rows")!
      const before = [...parent.children]
      t.api.moveLastToFront()
      flushMutations()

      expect(t.renderer.getElement(parent.id)!.children).toEqual([
        before[0],
        before[2],
        before[1],
      ])
      expect(mutationOps(t.renderer).filter(([name]) => name === "createElement")).toHaveLength(0)
    } finally {
      t.unmount()
    }
  })

  it("unbinds row patch listeners when a row is removed", () => {
    const t = mountRows([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ])
    try {
      t.api.removeAndKeep(0)
      flushMutations()
      t.renderer.drainOps()

      t.api.mutateRemoved("changed after removal")
      flushMutations()

      expect(mutationOps(t.renderer)).toEqual([])
    } finally {
      t.unmount()
    }
  })

  it("falls back to classic reconciliation for a signal array", () => {
    let append: (() => void) | undefined
    const t = mountTest(() => {
      const [rows, setRows] = createSignal<Row[]>([{ id: "a", title: "A" }])
      append = () => setRows((value) => [...value, { id: "b", title: "B" }])
      return (
        <div>
          <For each={rows()}>
            {(row) => <div testId={row.id} title={row.title}>row</div>}
          </For>
        </div>
      )
    })
    try {
      const a = findByTestId(t.renderer, "a")!.id
      append!()
      flushMutations()
      expect(findByTestId(t.renderer, "a")!.id).toBe(a)
      expect(findByTestId(t.renderer, "b")).toBeDefined()
    } finally {
      t.unmount()
    }
  })
})
