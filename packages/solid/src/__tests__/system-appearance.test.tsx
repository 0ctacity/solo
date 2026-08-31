import { afterEach, describe, expect, it } from "vitest"
import { createRoot, createSignal, flush } from "solid-js"
import type { Accessor } from "solid-js"
import { handleSoloEvent, MockNativeRenderer } from "@solo/core"
import { createSystemAppearance, flushMutations, render, setSoloRenderer, Text, View } from "@solo/solid"

class AppearanceRenderer extends MockNativeRenderer {
  appearance = "light"
  token: string | null = null
  subscriptions: Array<string | null> = []
  fail = false
  setSystemAppearanceSubscription(token: string | null): string {
    if (this.fail) throw new Error("System appearance is supported only on macOS")
    this.token = token
    this.subscriptions.push(token)
    return this.appearance
  }
  change(appearance: string, token = this.token): void {
    this.appearance = appearance
    handleSoloEvent({ elementId: 0, eventType: "systemAppearanceChange", value: JSON.stringify({ token, appearance }) })
  }
}

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
})
function owned(fn: () => void): () => void {
  let dispose!: () => void
  createRoot((cleanup) => { dispose = cleanup; fn() })
  disposers.push(dispose)
  return dispose
}

describe("system appearance", () => {
  it.each(["light", "dark"])("reads the initial %s snapshot and reacts to native events", (initial) => {
    const renderer = new AppearanceRenderer()
    renderer.appearance = initial
    setSoloRenderer(renderer)
    let appearance!: Accessor<"light" | "dark">
    owned(() => { appearance = createSystemAppearance() })
    expect(appearance()).toBe(initial)
    renderer.change("dark"); flush()
    expect(appearance()).toBe("dark")
    renderer.change("light"); flush()
    expect(appearance()).toBe("light")
  })

  it("shares one native observer and stops only after the last owner disposes", () => {
    const renderer = new AppearanceRenderer()
    setSoloRenderer(renderer)
    let first!: Accessor<"light" | "dark">
    let second!: Accessor<"light" | "dark">
    const stopFirst = owned(() => { first = createSystemAppearance() })
    const stopSecond = owned(() => { second = createSystemAppearance() })
    expect(renderer.subscriptions).toHaveLength(1)
    const token = renderer.token
    stopFirst()
    renderer.change("dark"); flush()
    expect(first()).toBe("light")
    expect(second()).toBe("dark")
    expect(renderer.token).toBe(token)
    stopSecond()
    expect(renderer.subscriptions).toEqual([token, null])
    renderer.change("light", token); flush()
    expect(second()).toBe("dark")
  })

  it("rejects old queued notifications after disposal and remount", () => {
    const renderer = new AppearanceRenderer()
    let appearance!: Accessor<"light" | "dark">
    const app = () => { appearance = createSystemAppearance(); return null }
    render(app, { renderer })
    const oldToken = renderer.token
    const root = render(app, { renderer })
    disposers.push(root.unmount)
    expect(renderer.token).not.toBe(oldToken)
    renderer.change("dark", oldToken); flush()
    expect(appearance()).toBe("light")
    renderer.change("dark"); flush()
    expect(appearance()).toBe("dark")
  })

  it("keeps explicit preference separate and updates theme props without rebuilding nodes", () => {
    const renderer = new AppearanceRenderer()
    const [preference, setPreference] = createSignal<"system" | "light" | "dark">("system")
    let mounts = 0
    const root = render(() => {
      mounts++
      const system = createSystemAppearance()
      const effective = () => preference() === "system" ? system() : preference()
      return <View><Text>{effective()}</Text><input theme={{ appearance: effective() as "light" | "dark" }} /></View>
    }, { renderer })
    disposers.push(root.unmount)
    flushMutations()
    renderer.drainOps()
    renderer.change("dark"); flushMutations()
    expect(renderer.getAllText()).toEqual(["dark"])
    expect(renderer.ops.some(([op]) => op === "setCustomProp")).toBe(true)
    expect(renderer.ops.some(([op]) => ["createElement", "destroyElement", "removeChild"].includes(op))).toBe(false)
    setPreference("light"); flushMutations()
    renderer.drainOps()
    renderer.change("light"); flushMutations()
    renderer.change("dark"); flushMutations()
    expect(renderer.getAllText()).toEqual(["light"])
    expect(renderer.ops.filter(([op]) => op !== "commitMutations")).toEqual([])
    setPreference("dark"); flushMutations()
    renderer.change("light"); flushMutations()
    expect(renderer.getAllText()).toEqual(["dark"])
    setPreference("system"); flushMutations()
    expect(renderer.getAllText()).toEqual(["light"])
    expect(mounts).toBe(1)
  })

  it("requires an owner and reports absent/unsupported native capability", () => {
    setSoloRenderer(new MockNativeRenderer())
    expect(() => createSystemAppearance()).toThrow(/owner|component/)
    owned(() => expect(() => createSystemAppearance()).toThrow(/support/))
    const renderer = new AppearanceRenderer()
    renderer.fail = true
    setSoloRenderer(renderer)
    owned(() => expect(() => createSystemAppearance()).toThrow("supported only on macOS"))
    renderer.fail = false
    owned(() => expect(createSystemAppearance()()).toBe("light"))
  })

  it("ignores invalid events and rejects invalid initial values without leaking the observer", () => {
    const renderer = new AppearanceRenderer()
    setSoloRenderer(renderer)
    renderer.appearance = "unknown"
    owned(() => expect(() => createSystemAppearance()).toThrow(/appearance/i))
    expect(renderer.token).toBeNull()
    renderer.appearance = "light"
    let appearance!: Accessor<"light" | "dark">
    owned(() => { appearance = createSystemAppearance() })
    renderer.change("unknown")
    handleSoloEvent({ elementId: 0, eventType: "systemAppearanceChange", value: "bad json" })
    flush()
    expect(appearance()).toBe("light")
  })
})
