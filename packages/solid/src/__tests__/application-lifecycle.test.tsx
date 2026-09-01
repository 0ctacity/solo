import { MockNativeRenderer } from "@solo/core"
import { describe, expect, it } from "vitest"
import { render, Text } from "@solo/solid"

class LifecycleRenderer extends MockNativeRenderer {
  calls: string[] = []

  showWindow(): void {
    this.calls.push("show")
  }

  closeWindow(): void {
    this.calls.push("close")
  }

  quitApplication(): void {
    this.calls.push("quit")
  }
}

describe("application lifecycle", () => {
  it("exposes window and application controls on the render root", () => {
    const renderer = new LifecycleRenderer()
    const root = render(() => <Text>background</Text>, { renderer })

    root.closeWindow()
    root.showWindow()
    root.quitApplication()

    expect(renderer.calls).toEqual(["close", "show", "quit"])
    root.unmount()
  })
})
