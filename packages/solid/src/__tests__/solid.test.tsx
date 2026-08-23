import { describe, expect, it } from "vitest"
import { createSignal, Show, For } from "solid-js"
import { View, Text, Button } from "@gpuix/solid"
import { mountTest, findByTestId, fireEvent, textOf } from "../test-utils.js"

/** setTimeout flushes every pending microtask (Solid commits) first. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function CounterApp() {
  const [count, setCount] = createSignal(0)
  return (
    <View style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Text testId="count">{count()}</Text>
      <Button testId="inc" onClick={() => setCount((v) => v + 1)}>
        Increment
      </Button>
    </View>
  )
}

describe("solid initial mount", () => {
  it("creates the native tree with root, view, text and button", () => {
    const t = mountTest(() => <CounterApp />)
    try {
      const root = t.renderer.getRoot()
      expect(root).toBeDefined()
      expect(root!.children.length).toBe(1)

      const view = t.renderer.getElement(root!.children[0])!
      expect(view.type).toBe("div")

      const texts = t.renderer.findByType("text")
      expect(texts.map((el) => el.text)).toContain("0")

      // The button is a div carrying the click listener.
      const button = findByTestId(t.renderer, "inc")!
      expect(button.type).toBe("div")
      expect(button.events.has("click")).toBe(true)
    } finally {
      t.unmount()
    }
  })
})

describe("reactive text update", () => {
  it("sends a single setText mutation when a signal changes", async () => {
    const t = mountTest(() => <CounterApp />)
    try {
      t.renderer.drainOps()

      fireEvent(t.renderer, "inc", "click")
      await tick()

      const countHost = findByTestId(t.renderer, "count")!
      const textNode = t.renderer.getElement(countHost.children[0])!
      expect(textNode.text).toBe("1")
      expect(t.renderer.getAllText()).toContain("1")

      // Fine-grained: only a setText crossed the FFI boundary — no tree rebuild.
      const ops = t.renderer.ops.filter(([op]) => op !== "commitMutations")
      expect(ops).toEqual([["setText", textNode.id, "1"]])

      fireEvent(t.renderer, "inc", "click")
      await tick()
      expect(findByTestId(t.renderer, "count")!.children
        .map((id) => t.renderer.getElement(id)!.text)).toContain("2")
    } finally {
      t.unmount()
    }
  })
})

describe("event handling", () => {
  it("routes native events through the shared registry to Solid handlers", () => {
    const clicks: number[] = []
    function App() {
      return (
        <Button testId="b" onClick={() => clicks.push(1)}>
          Press
        </Button>
      )
    }
    const t = mountTest(() => <App />)
    try {
      expect(clicks).toEqual([])
      fireEvent(t.renderer, "b", "click")
      fireEvent(t.renderer, "b", "click")
      expect(clicks).toEqual([1, 1])
    } finally {
      t.unmount()
    }
  })
})

describe("insertion and removal", () => {
  function ListApp() {
    const [items, setItems] = createSignal<string[]>([])
    return (
      <View>
        <Button testId="add" onClick={() => setItems((xs) => [...xs, `item${xs.length}`])}>
          Add
        </Button>
        <Button testId="removeFirst" onClick={() => setItems((xs) => xs.slice(1))}>
          Remove
        </Button>
        <For each={items()}>{(item) => <Text testId={item}>{item}</Text>}</For>
      </View>
    )
  }

  it("appends new children for new items", async () => {
    const t = mountTest(() => <ListApp />)
    try {
      fireEvent(t.renderer, "add", "click")
      fireEvent(t.renderer, "add", "click")
      await tick()
      expect(findByTestId(t.renderer, "item0")).toBeDefined()
      expect(findByTestId(t.renderer, "item1")).toBeDefined()
      expect(t.renderer.getAllText()).toContain("item0")
      expect(t.renderer.getAllText()).toContain("item1")
    } finally {
      t.unmount()
    }
  })

  it("destroys removed subtrees instead of rebuilding the list", async () => {
    const t = mountTest(() => <ListApp />)
    try {
      fireEvent(t.renderer, "add", "click")
      fireEvent(t.renderer, "add", "click")
      await tick()

      const id0 = findByTestId(t.renderer, "item0")!.id
      t.renderer.drainOps()

      fireEvent(t.renderer, "removeFirst", "click")
      await tick()

      expect(findByTestId(t.renderer, "item0")).toBeUndefined()
      // The removed element is destroyed; the kept element is not recreated.
      const destroyedIds = t.renderer.ops
        .filter(([op]) => op === "destroyElement")
        .flatMap(([, ids]) => ids as number[])
      expect(destroyedIds).toContain(id0)
      expect(findByTestId(t.renderer, "item1")).toBeDefined()
    } finally {
      t.unmount()
    }
  })

  it("unmount destroys the whole tree", async () => {
    const t = mountTest(() => <ListApp />)
    fireEvent(t.renderer, "add", "click")
    await tick()
    const allIds = [...t.renderer.elements.keys()]
    t.renderer.drainOps()

    t.unmount()

    const destroyCalls = t.renderer.ops.filter(([op]) => op === "destroyElement")
    expect(destroyCalls.length).toBeGreaterThan(0)
    for (const id of allIds) {
      expect(t.renderer.elements.has(id)).toBe(false)
    }
  })
})

describe("conditional rendering", () => {
  function ToggleApp() {
    const [on, setOn] = createSignal(true)
    return (
      <View>
        <Button testId="toggle" onClick={() => setOn((v) => !v)}>
          Toggle
        </Button>
        <Show when={on()}>
          <Text testId="conditional">visible</Text>
        </Show>
      </View>
    )
  }

  it("removes conditional children when they toggle away and restores them", async () => {
    const t = mountTest(() => <ToggleApp />)
    try {
      expect(textOf(t.renderer, findByTestId(t.renderer, "conditional")!)).toBe("visible")

      fireEvent(t.renderer, "toggle", "click")
      await tick()
      expect(findByTestId(t.renderer, "conditional")).toBeUndefined()

      fireEvent(t.renderer, "toggle", "click")
      await tick()
      expect(textOf(t.renderer, findByTestId(t.renderer, "conditional")!)).toBe("visible")
    } finally {
      t.unmount()
    }
  })
})

describe("style updates", () => {
  it("sends setStyle on mount and on reactive style changes without recreating elements", async () => {
    function App() {
      const [hot, setHot] = createSignal(false)
      return (
        <View>
          <Text
            testId="styled"
            style={{
              color: hot() ? "#f38ba8" : "#cdd6f4",
              fontSize: 48,
            }}
          >
            style target
          </Text>
          <Button testId="heat" onClick={() => setHot(true)}>
            Heat
          </Button>
        </View>
      )
    }
    const t = mountTest(() => <App />)
    try {
      const el = findByTestId(t.renderer, "styled")!
      expect(el.style.color).toBe("#cdd6f4")
      expect(el.style.fontSize).toBe(48)

      t.renderer.drainOps()
      fireEvent(t.renderer, "heat", "click")
      await tick()

      expect(el.style.color).toBe("#f38ba8")
      const createdIds = t.renderer.ops
        .filter(([op]) => op === "createElement")
        .map(([, id]) => id)
      expect(createdIds).not.toContain(el.id)
    } finally {
      t.unmount()
    }
  })

  it("forwards hover styles as native pseudo-selectors", () => {
    function App() {
      return (
        <View>
          <Text testId="hovered" style={{ color: "#fff", hover: { color: "#94e2d5" } }}>
            hover me
          </Text>
        </View>
      )
    }
    const t = mountTest(() => <App />)
    try {
      const el = findByTestId(t.renderer, "hovered")!
      expect(el.style.hover).toEqual({ color: "#94e2d5" })
    } finally {
      t.unmount()
    }
  })
})
