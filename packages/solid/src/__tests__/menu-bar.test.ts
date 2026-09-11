import { afterEach, describe, expect, it } from "vitest"
import { createRoot, createSignal, flush } from "solid-js"
import { handleSoloEvent, MockNativeRenderer } from "@solo/core"
import { configureMenuBar, setSoloRenderer } from "@solo/solid"

type NativeMenuBarState = {
  iconPath?: string
  tooltip?: string | null
  items: Array<Record<string, unknown>>
}

class MenuBarRenderer extends MockNativeRenderer {
  states: Array<NativeMenuBarState | null> = []

  setMenuBar(json: string | null): void {
    this.states.push(json === null ? null : JSON.parse(json))
  }
}

const disposers: Array<() => void> = []

afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
  setSoloRenderer(new MockNativeRenderer())
})

function owned(fn: () => void): () => void {
  let dispose!: () => void
  createRoot((cleanup) => {
    dispose = cleanup
    fn()
  })
  disposers.push(dispose)
  return dispose
}

function invoke(token: string): void {
  handleSoloEvent({ elementId: 0, eventType: "menuBarAction", value: token })
}

describe("menu-bar configuration", () => {
  it("publishes custom controls and routes a native action exactly once", () => {
    const renderer = new MenuBarRenderer()
    setSoloRenderer(renderer)
    let refreshes = 0
    owned(() => configureMenuBar(() => ({
      iconPath: "/tmp/refreshing.png",
      tooltip: "Refreshing",
      items: [
        { id: "refresh", label: "Refresh now", checked: true, run: () => refreshes++ },
        { type: "separator" },
        { type: "status", label: "Last refresh: 10:42" },
      ],
    })))

    expect(renderer.states[0]).toEqual({
      iconPath: "/tmp/refreshing.png",
      tooltip: "Refreshing",
      items: [
        { type: "action", token: expect.any(String), label: "Refresh now", enabled: true, checked: true },
        { type: "separator" },
        { type: "status", label: "Last refresh: 10:42" },
      ],
    })
    const token = String(renderer.states[0]!.items[0]!.token)
    invoke(token)
    expect(refreshes).toBe(1)
  })

  it("reactively replaces icon and item state while rejecting stale or disabled actions", () => {
    const renderer = new MenuBarRenderer()
    setSoloRenderer(renderer)
    const [busy, setBusy] = createSignal(false)
    let refreshes = 0
    owned(() => configureMenuBar(() => ({
      iconPath: busy() ? "/tmp/busy.png" : "/tmp/idle.png",
      items: [{
        id: "refresh",
        label: busy() ? "Refreshing…" : "Refresh",
        enabled: !busy(),
        run: () => refreshes++,
      }],
    })))
    const oldToken = String(renderer.states[0]!.items[0]!.token)

    setBusy(true)
    flush()
    expect(renderer.states.at(-1)).toMatchObject({
      iconPath: "/tmp/busy.png",
      items: [{ label: "Refreshing…", enabled: false }],
    })
    invoke(oldToken)
    invoke(String(renderer.states.at(-1)!.items[0]!.token))
    expect(refreshes).toBe(0)
  })

  it("restores the default menu on owner disposal and ignores queued actions", () => {
    const renderer = new MenuBarRenderer()
    setSoloRenderer(renderer)
    let calls = 0
    const dispose = owned(() => configureMenuBar(() => ({
      items: [{ id: "refresh", label: "Refresh", run: () => calls++ }],
    })))
    const token = String(renderer.states[0]!.items[0]!.token)

    dispose()
    expect(renderer.states.at(-1)).toBeNull()
    invoke(token)
    expect(calls).toBe(0)
  })

  it("validates descriptors before changing the native menu", () => {
    const renderer = new MenuBarRenderer()
    setSoloRenderer(renderer)
    owned(() => {
      expect(() => configureMenuBar(() => ({
        items: [{ id: "", label: "Refresh", run() {} }],
      }))).toThrow(/non-empty/i)
    })
    expect(renderer.states).toEqual([])
  })
})
