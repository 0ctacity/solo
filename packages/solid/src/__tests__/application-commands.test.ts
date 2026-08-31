import { afterEach, describe, expect, it } from "vitest"
import { createRoot, createSignal, flush } from "solid-js"
import { handleSoloEvent, MockNativeRenderer } from "@solo/core"
import { registerApplicationCommand, render, setSoloRenderer } from "@solo/solid"

type Descriptor = {
  id: string
  label: string
  shortcut?: string
  menu?: string
  enabled: boolean
}

// The native bridge is the boundary: exercise real Solid ownership, registry,
// and event routing without opening a macOS window in these headless tests.
class CommandRenderer extends MockNativeRenderer {
  commands: Descriptor[] = []
  failNext = false

  setApplicationCommands(json: string): void {
    if (this.failNext) {
      this.failNext = false
      throw new Error("native registration failed")
    }
    this.commands = JSON.parse(json)
  }
}

const disposers: Array<() => void> = []
afterEach(() => {
  for (const dispose of disposers.splice(0).reverse()) dispose()
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

function invoke(id: string): void {
  handleSoloEvent({ elementId: 0, eventType: "applicationCommand", value: id })
}

describe("application commands", () => {
  it("exports registration through the Solid public API and routes native actions once", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    let calls = 0
    owned(() => registerApplicationCommand({
      id: "refresh", label: "Refresh", shortcut: "cmd-r", menu: "Article",
      run: () => calls++,
    }))
    expect(renderer.commands).toEqual([{
      id: expect.any(String), label: "Refresh", shortcut: "cmd-r", menu: "Article", enabled: true,
    }])
    invoke(renderer.commands[0].id)
    expect(calls).toBe(1)
  })

  it("reactively disables both native dispatch and queued callbacks without mutating the tree", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    const [enabled, setEnabled] = createSignal(true)
    let calls = 0
    owned(() => registerApplicationCommand({
      id: "refresh", label: "Refresh", enabled, run: () => calls++,
    }))
    const token = renderer.commands[0].id
    renderer.ops.length = 0
    setEnabled(false)
    flush()
    expect(renderer.commands[0].enabled).toBe(false)
    invoke(token)
    expect(calls).toBe(0)
    setEnabled(true)
    flush()
    invoke(token)
    expect(calls).toBe(1)
    expect(renderer.ops).toEqual([])
  })

  it("removes only the disposed command and ignores its queued event after re-registration", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    let oldCalls = 0
    let newCalls = 0
    const dispose = owned(() => registerApplicationCommand({
      id: "refresh", label: "Refresh", run: () => oldCalls++,
    }))
    const oldToken = renderer.commands[0].id
    owned(() => registerApplicationCommand({ id: "other", label: "Other", run() {} }))
    dispose()
    expect(renderer.commands.map((c) => c.label)).toEqual(["Other"])
    owned(() => registerApplicationCommand({
      id: "refresh", label: "Refresh", run: () => newCalls++,
    }))
    invoke(oldToken)
    expect(oldCalls).toBe(0)
    expect(newCalls).toBe(0)
    invoke(renderer.commands[1].id)
    expect(newCalls).toBe(1)
  })

  it("supports early idempotent disposal in addition to owner cleanup", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    let unregister!: () => void
    owned(() => { unregister = registerApplicationCommand({ id: "r", label: "Refresh", run() {} }) })
    unregister()
    unregister()
    expect(renderer.commands).toEqual([])
  })

  it("rejects duplicate IDs without replacing the existing handler", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    let calls = 0
    owned(() => {
      registerApplicationCommand({ id: "r", label: "Refresh", run: () => calls++ })
      expect(() => registerApplicationCommand({ id: "r", label: "Again", run() {} })).toThrow(/already registered/)
    })
    expect(renderer.commands).toHaveLength(1)
    invoke(renderer.commands[0].id)
    expect(calls).toBe(1)
  })

  it("does not retain a failed native registration", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    owned(() => {
      renderer.failNext = true
      expect(() => registerApplicationCommand({ id: "r", label: "Refresh", run() {} })).toThrow("native registration failed")
      registerApplicationCommand({ id: "r", label: "Refresh", run() {} })
    })
    expect(renderer.commands).toHaveLength(1)
  })

  it("requires a Solid owner and an available native capability", () => {
    setSoloRenderer(new CommandRenderer())
    expect(() => registerApplicationCommand({ id: "r", label: "Refresh", run() {} })).toThrow(/owner|component/)
    setSoloRenderer(new MockNativeRenderer())
    owned(() => {
      expect(() => registerApplicationCommand({ id: "r", label: "Refresh", run() {} })).toThrow(/support/)
    })
  })

  it("cleans commands up when render remounts and rejects old queued callbacks", () => {
    const renderer = new CommandRenderer()
    let calls = 0
    const app = () => {
      registerApplicationCommand({ id: "r", label: "Refresh", run: () => calls++ })
      return null
    }
    render(app, { renderer })
    const oldToken = renderer.commands[0].id
    const root = render(app, { renderer })
    disposers.push(root.unmount)
    expect(renderer.commands).toHaveLength(1)
    invoke(oldToken)
    expect(calls).toBe(0)
    invoke(renderer.commands[0].id)
    expect(calls).toBe(1)
    root.unmount()
    expect(renderer.commands).toEqual([])
  })

  it("rejects invalid runtime options before sending anything to native", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    owned(() => {
      for (const options of [{ id: "" }, { label: " " }, { menu: "" }, { shortcut: "" }, { enabled: "yes" }, { run: null }]) {
        expect(() => registerApplicationCommand({ id: "r", label: "Refresh", run() {}, ...options } as never)).toThrow()
      }
    })
    expect(renderer.commands).toEqual([])
  })

  it("rejects a queued event immediately after disabling, before effects flush", () => {
    const renderer = new CommandRenderer()
    setSoloRenderer(renderer)
    const [enabled, setEnabled] = createSignal(true)
    let calls = 0
    owned(() => registerApplicationCommand({ id: "r", label: "Refresh", enabled, run: () => calls++ }))
    const token = renderer.commands[0].id
    setEnabled(false)
    invoke(token)
    expect(calls).toBe(0)
  })
})
