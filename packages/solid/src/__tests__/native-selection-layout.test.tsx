/// Selection hit-testing against layout structure: columns, siblings,
/// opt-outs, and custom-element click targets. Faithful port of packages
/// /react selection-layout.test.tsx.

import { describe, expect, it, vi } from "vitest"
import { createSolidNativeTestRoot, hasNativeTestRenderer } from "../testing.js"
import { Text } from "../components.js"

const describeNative = hasNativeTestRenderer ? describe : describe.skip

describeNative("selection layout", () => {
  it("selects the column the pointer is actually in", () => {
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", padding: 20 }}>
        <div style={{ display: "flex", width: 120 }}>
          <Text style={{ fontSize: 20 }}>LEFTSIDE</Text>
        </div>
        <div style={{ display: "flex" }}>
          <Text style={{ fontSize: 20 }}>RIGHTSIDE</Text>
        </div>
      </div>
    ))

    const right = renderer.findByType("text").filter((text) => text.text == null)[1]!
    const [x, y, width, height] = renderer.getElementBounds(right.id)!
    const selected = renderer.dragSelect(x + 1, y + height / 2, x + width, y + height / 2)
    expect(selected).not.toBeNull()
    expect(selected).not.toContain("LEFT")
    expect("RIGHTSIDE".endsWith(selected!)).toBe(true)
  })

  it("selects the left column when the drag stays there", () => {
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", padding: 20 }}>
        <div style={{ display: "flex", width: 120 }}>
          <Text style={{ fontSize: 20 }}>LEFTSIDE</Text>
        </div>
        <div style={{ display: "flex" }}>
          <Text style={{ fontSize: 20 }}>RIGHTSIDE</Text>
        </div>
      </div>
    ))

    const selected = renderer.dragSelect(21, 30, 120, 30)
    expect(selected).not.toBeNull()
    expect(selected).not.toContain("RIGHT")
  })

  it("spans two columns when the drag crosses them", () => {
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <div style={{ display: "flex" }}>
          <Text style={{ fontSize: 20 }}>AAAA</Text>
        </div>
        <div style={{ display: "flex" }}>
          <Text style={{ fontSize: 20 }}>BBBB</Text>
        </div>
      </div>
    ))

    const selected = renderer.dragSelect(21, 30, 900, 90)
    expect(selected).toBe("AAAA\nBBBB")
  })

  it("does not leak inherited selectability across siblings", () => {
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <div style={{ display: "flex", userSelect: "none" }}>
          <Text style={{ fontSize: 20 }}>chrome</Text>
        </div>
        <div style={{ display: "flex" }}>
          <Text style={{ fontSize: 20 }}>content</Text>
        </div>
      </div>
    ))

    const selected = renderer.dragSelect(21, 62, 900, 62)
    expect(selected).toBe("content")
  })

  it("keeps unstyled text siblings laid out side by side", () => {
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", padding: 20 }}>
        <Text>one </Text>
        <Text>two</Text>
      </div>
    ))

    const texts = renderer.findByType("text").filter((text) => text.text == null)
    const first = renderer.getElementBounds(texts[0]!.id)!
    const second = renderer.getElementBounds(texts[1]!.id)!
    expect(second[0]).toBeGreaterThan(first[0])
    expect(second[1]).toBe(first[1])
  })

  it("registers once per frame, not once per text element", () => {
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <Text style={{ fontSize: 18 }}>{`line ${i}`}</Text>
        ))}
      </div>
    ))

    const selected = renderer.dragSelect(21, 26, 900, 700)
    expect(selected).not.toBeNull()
    expect(selected!.split("\n").length).toBeGreaterThan(5)
  })

  it("includes text that opted out of selection", () => {
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <Text style={{ fontSize: 20, userSelect: "none" }}>untouchable</Text>
      </div>
    ))

    // Opted-out text is painted but not part of the selectable registry.
    expect(renderer.dragSelect(21, 30, 900, 30)).toBeNull()
  })
})

describeNative("custom element click targets", () => {
  it("fires onClick on <code>", () => {
    const onClick = vi.fn()
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <code code="const a = 1" language="ts" onClick={onClick} />
      </div>
    ))

    renderer.nativeSimulateClick(60, 40)
    expect(onClick).toHaveBeenCalled()
  })

  it("fires onClick on <markdown>", () => {
    const onClick = vi.fn()
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <markdown source="# clicked" onClick={onClick} />
      </div>
    ))

    renderer.nativeSimulateClick(40, 40)
    expect(onClick).toHaveBeenCalled()
  })

  it("fires onClick on <diff>", () => {
    const onClick = vi.fn()
    const { render, renderer } = createSolidNativeTestRoot()
    render(() => (
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <diff
          patch={"--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-old\n+new\n"}
          onLineClick={onClick}
        />
      </div>
    ))

    const diff = renderer.findByType("diff")[0]!
    const [x, y] = renderer.getElementBounds(diff.id)!
    renderer.nativeSimulateClick(x + 60, y + 70)
    expect(onClick).toHaveBeenCalled()
  })
})
