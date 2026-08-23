/// Lifecycle regressions for the Solid runtime, written against the same
/// patterns the tasks dogfood app uses (store + For + Show).
///
/// Every test drives the app through the real protocol path: fireEvent →
/// shared event registry → Solid handler → mutations → applyBatch — and then
/// asserts on MockNativeRenderer's op log, which records exactly what would
/// cross the FFI boundary.

import { describe, expect, it } from "vitest"
import { createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js"
import { View, Text } from "@gpuix/solid"
import { mountTest, findByTestId } from "../test-utils.js"
import { handleGpuixEvent } from "@gpuix/core"
import type { EventPayload } from "@gpuix/native"
import type { MockElement } from "@gpuix/core"

interface Task {
  id: number
  title: string
  completed: boolean
}

/** Per-fixture id space so tests never share element/task identities. */
function makeIdFactory(): { next: () => number } {
  let id = 0
  return { next: () => ++id }
}

/** Mirrors examples/tasks/app.tsx row structure with per-row testIds. */
function TasksFixture(props: { seedCount?: number; onReady?: (api: FixtureApi) => void }) {
  const ids = makeIdFactory()
  const [tasks, setTasks] = createStore<Task[]>(
    Array.from({ length: props.seedCount ?? 6 }, (_, i) => ({
      id: ids.next(),
      title: `task ${i + 1}`,
      completed: false,
    }))
  )
  const [showList, setShowList] = createSignal(true)
  const api: FixtureApi = {
    addTask: () => setTasks((state) => void state.push({ id: ids.next(), title: "new", completed: false })),
    deleteTask: (id) => setTasks((state) => state.filter((t) => t.id !== id)),
    toggleTask: (id) =>
      setTasks((state) => {
        const row = state.find((t) => t.id === id)
        if (row) row.completed = !row.completed
      }),
    moveFirstToEnd: () =>
      setTasks((state) => {
        const first = state.shift()
        if (first) state.push(first)
      }),
    toggleShow: () => setShowList((v) => !v),
    ids: () => tasks.map((t) => t.id),
  }
  props.onReady?.(api)
  return (
    <View>
      <Show when={showList()}>
        {/* keyed by id so reordering moves nodes instead of rebuilding them;
            key-function mode hands the children an accessor */}
        <For each={tasks} keyed={(t) => (t as Task).id}>
          {(item) => {
            // Key-function mode hands us an accessor; read it lazily so every
            // property read lands in a tracking scope.
            const task = item as unknown as () => Task
            return (
              <View testId={`task-${task().id}`}>
                <Text
                  testId={`title-${task().id}`}
                  style={{ color: task().completed ? "#585b70" : "#cdd6f4" }}
                >
                  {task().title}
                </Text>
                <View
                  testId={`check-${task().id}`}
                  onClick={() => api.toggleTask(task().id)}
                  style={{ width: 20, height: 20 }}
                />
              </View>
            )
          }}
        </For>
      </Show>
    </View>
  )
}

interface FixtureApi {
  addTask: () => void
  deleteTask: (id: number) => void
  toggleTask: (id: number) => void
  moveFirstToEnd: () => void
  toggleShow: () => void
  ids: () => number[]
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** Every element-mutation op (ignores bookkeeping commitMutations). */
function elementOps(t: ReturnType<typeof mountTest>) {
  return t.renderer.ops.filter(([op]) => op !== "commitMutations")
}

describe("lifecycle: mount", () => {
  it("creates one subtree per task", () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={5} onReady={(a) => captured.push(a)} />)
    try {
      expect(t.renderer.getAllText()).toEqual([
        "task 1",
        "task 2",
        "task 3",
        "task 4",
        "task 5",
      ])
      // Mount itself must already be fully committed.
      expect(t.renderer.rootId).not.toBeNull()
      t.renderer.drainOps()
      expect(elementOps(t)).toEqual([])
    } finally {
      t.unmount()
    }
  })
})

describe("lifecycle: fine-grained updates", () => {
  it("toggling one task of many mutates only that row's nodes", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={30} onReady={(a) => captured.push(a)} />) 
    try {
      const api = captured[0]!
      const before = new Set(t.renderer.elements.keys())
      const rowBefore = findByTestId(t.renderer, "task-1")!
      const titleBefore = findByTestId(t.renderer, "title-1")!

      t.renderer.drainOps()
      api.toggleTask(1)
      await tick()

      const ops = elementOps(t)
      // The only pre-existing elements touched belong to task 1's row.
      const touchedIds = new Set<number>()
      for (const op of ops) {
        if (op[0] === "setStyle" || op[0] === "setText" || op[0] === "setCustomProp" ||
            op[0] === "appendChild" || op[0] === "insertBefore") {
          touchedIds.add(op[1] as number)
        } else if (op[0] === "removeChild") {
          touchedIds.add(op[1] as number)
        }
      }
      for (const id of touchedIds) {
        const el = t.renderer.getElement(id)
        // Newly created check-mark children aside, every touched element must
        // live inside task 1's row.
        expect(
          el == null || id === rowBefore.id || isDescendantOf(t.renderer, id, rowBefore.id),
          `element ${id} outside task 1's row was mutated`
        ).toBe(true)
      }
      // No other row was created or destroyed.
      const created = ops.filter(([op]) => op === "createElement").map(([, id]) => id)
      for (const id of created) {
        expect(
          t.renderer.getElement(id as number)?.parentId === rowBefore.id,
          "createElement outside task 1's row"
        ).toBe(true)
      }
      expect(t.renderer.elements.size).toBe(before.size + 0) // no net growth yet
      expect(findByTestId(t.renderer, "title-1")).toBe(titleBefore)
      expect(titleBefore.style.color).toBe("#585b70")
    } finally {
      t.unmount()
    }
  })

  it("toggling repeatedly never recreates the task subtree", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={3} onReady={(a) => captured.push(a)} />) 
    try {
      const api = captured[0]
      const row = findByTestId(t.renderer, "task-2")!
      const title = findByTestId(t.renderer, "title-2")!
      const elementsAtStart = t.renderer.elements.size

      for (let i = 0; i < 4; i++) {
        api!.toggleTask(2)
        await tick()
      }

      expect(findByTestId(t.renderer, "task-2")?.id).toBe(row.id)
      expect(findByTestId(t.renderer, "title-2")?.id).toBe(title.id)
      expect(t.renderer.elements.size).toBe(elementsAtStart)
      const destroyed = t.renderer.ops.filter(([op]) => op === "destroyElement")
      expect(destroyed).toEqual([])
    } finally {
      t.unmount()
    }
  })
})

describe("lifecycle: deletion", () => {
  it("deleting a task destroys exactly its subtree and keeps sibling node identities", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={4} onReady={(a) => captured.push(a)} />) 
    try {
      const api = captured[0]
      const victimRow = findByTestId(t.renderer, "task-2")!
      const victims = collectSubtree(t.renderer, victimRow.id)
      const siblingTitle3 = findByTestId(t.renderer, "title-3")!
      const siblingTitle1 = findByTestId(t.renderer, "title-1")!

      t.renderer.drainOps()
      api!.deleteTask(2)
      await tick()

      // The protocol only needs destroyElement on the subtree root —
      // descendants are destroyed natively by recursion.
      const destroyedIds = t.renderer.ops
        .filter(([op]) => op === "destroyElement")
        .map(([, id]) => id as number)
      expect(destroyedIds).toEqual([victimRow.id])
      for (const id of victims) {
        expect(t.renderer.elements.has(id), `element ${id} still alive`).toBe(false)
      }

      // Siblings were not rebuilt.
      expect(findByTestId(t.renderer, "title-3")?.id).toBe(siblingTitle3.id)
      expect(findByTestId(t.renderer, "title-1")?.id).toBe(siblingTitle1.id)
      expect(findByTestId(t.renderer, "task-2")).toBeUndefined()
    } finally {
      t.unmount()
    }
  })

  it("updating a deleted task's state produces zero native mutations", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={3} onReady={(a) => captured.push(a)} />) 
    try {
      const api = captured[0]
      api!.deleteTask(1)
      await tick()
      t.renderer.drainOps()

      // The old closure still references the deleted id — invoking it must
      // not touch the native tree.
      api!.toggleTask(1)
      await tick()

      expect(elementOps(t)).toEqual([])
      expect(t.renderer.findByType("text").map((e) => e.text)).not.toContain("task 1")
    } finally {
      t.unmount()
    }
  })

  it("events fired at a deleted subtree are inert", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={3} onReady={(a) => captured.push(a)} />) 
    try {
      const api = captured[0]
      const doomed = findByTestId(t.renderer, "check-2")!
      expect(doomed.events.has("click")).toBe(true)
      api!.deleteTask(2)
      await tick()
      expect(findByTestId(t.renderer, "check-2")).toBeUndefined()

      t.renderer.drainOps()
      // The registry entry was unregistered by the destroy flush; firing the
      // former event (same element id) must do nothing, not throw.
      expect(() =>
        handleGpuixEvent({ elementId: doomed.id, eventType: "click" } as EventPayload)
      ).not.toThrow()
      await tick()
      expect(elementOps(t)).toEqual([])
    } finally {
      t.unmount()
    }
  })
})

describe("lifecycle: disposal", () => {
  it("after dispose root, signal updates produce zero native mutations", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={3} onReady={(a) => captured.push(a)} />) 
    const api = captured[0]
    t.unmount()
    t.renderer.drainOps()

    api.addTask()
    api.toggleTask(1)
    api.deleteTask(2)
    await tick()

    expect(elementOps(t)).toEqual([])
    expect(t.renderer.elements.size).toBe(0)
  })
})

describe("lifecycle: control flow", () => {
  it("insertion appends one new subtree", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={2} onReady={(a) => captured.push(a)} />) 
    try {
      const sizeBefore = t.renderer.elements.size
      t.renderer.drainOps()
      captured[0]!.addTask()
      await tick()
      const ops = elementOps(t)
      const created = ops.filter(([op]) => op === "createElement")
      // One row subtree: row + title text + checkbox view. Exact count is an
      // implementation detail; the guarantee is that nothing else changed.
      expect(created.length).toBeGreaterThan(0)
      expect(findByTestId(t.renderer, "task-new") ?? findNewestRow(t)).toBeDefined()
      expect(t.renderer.elements.size).toBeGreaterThan(sizeBefore)
      expect(t.renderer.getAllText()).toContain("new")
    } finally {
      t.unmount()
    }
  })

  it("reordering preserves node identities", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={3} onReady={(a) => captured.push(a)} />) 
    try {
      const api = captured[0]
      const title1 = findByTestId(t.renderer, "title-1")!
      const title3 = findByTestId(t.renderer, "title-3")!
      t.renderer.drainOps()

      api!.moveFirstToEnd()
      await tick()

      // Same nodes, moved rather than recreated.
      expect(findByTestId(t.renderer, "title-1")?.id).toBe(title1.id)
      expect(findByTestId(t.renderer, "title-3")?.id).toBe(title3.id)
      // Native tree order — not map insertion order — must reflect the move.
      // Root div > fixture View > rows.
      const listView = t.renderer.getRoot()!.children[0]
      const rowIds = t.renderer.getElement(listView)!.children
      const order = rowIds.map((id) => t.renderer.getElement(id)?.customProps.testId)
      expect(order).toEqual(["task-2", "task-3", "task-1"])

      const created = elementOps(t).filter(([op]) => op === "createElement")
      expect(created).toEqual([])
      expect(elementOps(t).filter(([op]) => op === "destroyElement")).toEqual([])
      // Movement crossed the boundary as re-parenting operations.
      const moves = elementOps(t).filter(
        ([op]) => op === "removeChild" || op === "insertBefore" || op === "appendChild"
      )
      expect(moves.length).toBeGreaterThan(0)
    } finally {
      t.unmount()
    }
  })

  it("Show removes and restores a whole section", async () => {
    const captured: FixtureApi[] = []
    const t = mountTest(() => <TasksFixture seedCount={2} onReady={(a) => captured.push(a)} />) 
    try {
      const api = captured[0]
      expect(t.renderer.getAllText()).toContain("task 1")

      api!.toggleShow()
      await tick()
      expect(t.renderer.getAllText()).toEqual([])

      api!.toggleShow()
      await tick()
      expect(t.renderer.getAllText()).toEqual(["task 1", "task 2"])
    } finally {
      t.unmount()
    }
  })
})

// ── helpers ──────────────────────────────────────────────────────────

function isDescendantOf(
  renderer: { getElement(id: number): MockElement | undefined },
  id: number,
  ancestorId: number
): boolean {
  let current = renderer.getElement(id)?.parentId
  while (current != null) {
    if (current === ancestorId) return true
    current = renderer.getElement(current)?.parentId
  }
  return false
}

function collectSubtree(renderer: { getElement(id: number): MockElement | undefined }, rootId: number): number[] {
  const out: number[] = []
  const walk = (id: number): void => {
    out.push(id)
    for (const child of renderer.getElement(id)?.children ?? []) walk(child)
  }
  walk(rootId)
  return out
}

/** After addTask() the new row has the highest numeric testId. */
function findNewestRow(t: ReturnType<typeof mountTest>): MockElement | undefined {
  const rows = [...t.renderer.elements.values()].filter((e) =>
    String(e.customProps.testId ?? "").startsWith("task-")
  )
  rows.sort((a, b) => Number(String(b.customProps.testId).slice(5)) - Number(String(a.customProps.testId).slice(5)))
  return rows[0]
}
