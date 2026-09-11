import { MockNativeRenderer } from "@solo/core"
import { describe, expect, it } from "vitest"
import { render, Text } from "@solo/solid"

class LifecycleRenderer extends MockNativeRenderer {
  calls: string[] = []
  maximized = false

  showWindow(): void {
    this.calls.push("show")
  }

  closeWindow(): void {
    this.calls.push("close")
  }

  quitApplication(): void {
    this.calls.push("quit")
  }

  setWindowMaximized(maximized: boolean): void {
    this.maximized = maximized
    this.calls.push(maximized ? "maximize" : "restore")
  }

  isWindowMaximized(): boolean {
    return this.maximized
  }
}

describe("application lifecycle", () => {
  it("exposes window and application controls on the render root", () => {
    const renderer = new LifecycleRenderer()
    const root = render(() => <Text>background</Text>, { renderer })

    root.closeWindow()
    root.showWindow()
    root.maximizeWindow()
    expect(root.isWindowMaximized()).toBe(true)
    root.maximizeWindow()
    root.restoreWindow()
    renderer.maximized = true // Native zoom button changed the window state.
    expect(root.isWindowMaximized()).toBe(true)
    root.toggleWindowMaximized()
    expect(root.isWindowMaximized()).toBe(false)
    root.quitApplication()

    expect(renderer.calls).toEqual([
      "close", "show", "maximize", "maximize", "restore", "restore", "quit",
    ])
    root.unmount()
  })
})
