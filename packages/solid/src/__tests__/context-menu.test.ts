import { afterEach, describe, expect, it } from "vitest"
import { MockNativeRenderer } from "@solo/core"
import { createRenderEffect, createRoot, createSignal, flush } from "solid-js"
import { createContextMenu, setSoloRenderer } from "@solo/solid"

class MenuRenderer extends MockNativeRenderer {
  requests: Record<string, unknown>[] = []
  cancelled: number[] = []
  complete: (id: string | null) => void = () => {}
  showContextMenu(json: string): Promise<string | null> {
    this.requests.push(JSON.parse(json))
    return new Promise((resolve) => { this.complete = resolve })
  }
  cancelContextMenu(id: number): void { this.cancelled.push(id) }
}

afterEach(() => setSoloRenderer(new MockNativeRenderer()))

describe("native context menu", () => {
  it("applies staged Solid owner disposal before a queued native completion", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    const selected: string[] = []
    const [visible, setVisible] = createSignal(true)
    let menu!: ReturnType<typeof createContextMenu>
    const dispose = createRoot((dispose) => {
      createRenderEffect(visible, (isVisible) => {
        if (isVisible) {
          menu = createContextMenu([{ id: "read", label: "Read" }], (id) => selected.push(id))
          return () => menu.dispose()
        }
      })
      return dispose
    })
    flush()
    try {
      const result = menu.show({ elementId: 7 })
      renderer.complete("read")
      setVisible(false)
      await expect(result).resolves.toBeNull()
      expect(selected).toEqual([])
    } finally { dispose() }
  })

  it("preserves a completed selection when its callback disposes the controller", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    const menu = createContextMenu([{ id: "read", label: "Read" }], () => menu.dispose())
    const result = menu.show({ elementId: 7 })
    renderer.complete("read")
    await expect(result).resolves.toBe("read")
  })

  it("cancels a replaced session and ignores its late completion", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    const selected: string[] = []
    const menu = createContextMenu([{ id: "read", label: "Read" }], (id) => selected.push(id))
    const first = menu.show({ elementId: 7 })
    const finishFirst = renderer.complete
    const second = menu.show({ elementId: 7 })
    await expect(first).resolves.toBeNull()
    finishFirst("read")
    renderer.complete("read")
    await expect(second).resolves.toBe("read")
    expect(selected).toEqual(["read"])
    menu.dispose()
  })

  it("ties the controller to its Solid owner", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    let dispose = () => {}
    const menu = createRoot((cleanup) => {
      dispose = cleanup
      return createContextMenu([{ id: "read", label: "Read" }])
    })
    const result = menu.show({ elementId: 7 })
    dispose()
    await expect(result).resolves.toBeNull()
    expect(renderer.cancelled).toHaveLength(1)
  })

  it("rejects an unavailable native selection without invoking the application", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    const selected: string[] = []
    const menu = createContextMenu([{ id: "delete", label: "Delete", disabled: true }], (id) => selected.push(id))
    const result = menu.show({ elementId: 7 })
    renderer.complete("delete")
    await expect(result).rejects.toThrow(/unavailable/i)
    expect(selected).toEqual([])
    menu.dispose()
  })

  it("sends pointer placement and descriptors, then dispatches a selection once", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    const selected: string[] = []
    const menu = createContextMenu([
      { id: "read", label: "Mark read", checked: true },
      { type: "separator" },
      { id: "delete", label: "Delete", disabled: true },
    ], (id) => selected.push(id))
    const result = menu.show({ elementId: 7, x: 120, y: 175 })
    expect(renderer.requests[0]).toMatchObject({ elementId: 7, x: 120, y: 175,
      items: [{ id: "read", label: "Mark read", checked: true }, { type: "separator" },
        { id: "delete", label: "Delete", disabled: true }] })
    renderer.complete("read")
    await expect(result).resolves.toBe("read")
    expect(selected).toEqual(["read"])
    menu.dispose()
  })

  it("supports an element anchor and normal cancellation", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    const selected: string[] = []
    const menu = createContextMenu([{ id: "read", label: "Read" }], (id) => selected.push(id))
    const result = menu.show({ elementId: 7 })
    expect(renderer.requests[0]).toMatchObject({ elementId: 7 })
    expect(renderer.requests[0]).not.toHaveProperty("x")
    renderer.complete(null)
    await expect(result).resolves.toBeNull()
    expect(selected).toEqual([])
    menu.dispose()
  })

  it("settles disposal immediately and suppresses late native selection", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    const selected: string[] = []
    const menu = createContextMenu([{ id: "read", label: "Read" }], (id) => selected.push(id))
    const result = menu.show({ elementId: 7 })
    menu.dispose()
    await expect(result).resolves.toBeNull()
    expect(renderer.cancelled).toEqual([renderer.requests[0]!.requestId])
    renderer.complete("read")
    await Promise.resolve()
    expect(selected).toEqual([])
    await expect(menu.show({ elementId: 7 })).rejects.toThrow(/disposed/i)
  })

  it("rejects duplicate IDs and invalid placements before touching native UI", async () => {
    const renderer = new MenuRenderer()
    setSoloRenderer(renderer)
    expect(() => createContextMenu([{ id: "x", label: "One" }, { id: "x", label: "Two" }])).toThrow(/duplicate/i)
    const menu = createContextMenu([{ id: "x", label: "One" }])
    await expect(menu.show({ elementId: 7, x: NaN, y: 1 })).rejects.toThrow(/finite/i)
    expect(renderer.requests).toEqual([])
    menu.dispose()
  })
})
