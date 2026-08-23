/// The native <code> element: syntax highlighting, line numbers, selection.

import fs from "fs"
import path from "path"
import React from "react"
import { beforeAll, describe, expect, it } from "vitest"
import { createTestRoot } from "../testing.js"
import { expectScreenshotsDiffer, SHOTS_DIR } from "./test-utils.js"

const TS_SOURCE = `interface User {
  id: number
  name: string
}

export function greet(user: User): string {
  // Say hello.
  return \`hello \${user.name}\`
}`

beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
})

describe("<code>", () => {
  it("renders one row per source line", () => {
    const { render, renderer } = createTestRoot()
    render(<code code={"a\nb\nc"} language="ts" />)

    // The language header paints first, then one entry per line.
    expect(renderer.getPaintedText()).toEqual(["ts", "a", "b", "c"])
  })

  it("renders an empty code block without crashing", () => {
    const { render, renderer } = createTestRoot()
    render(<code code="" language="ts" />)
    expect(renderer.findByType("code")).toHaveLength(1)
  })

  it("shows the language header only when a language is given", () => {
    const withLanguage = createTestRoot()
    withLanguage.render(<code code="x = 1" language="python" />)
    expect(withLanguage.renderer.getPaintedText()).toContain("python")

    const withoutLanguage = createTestRoot()
    withoutLanguage.render(<code code="x = 1" />)
    expect(withoutLanguage.renderer.getPaintedText()).not.toContain("python")
  })

  it("hides the header when showHeader is false", () => {
    const { render, renderer } = createTestRoot()
    render(<code code="x = 1" language="python" showHeader={false} />)
    expect(renderer.getPaintedText()).not.toContain("python")
  })

  it("renders line numbers when asked", () => {
    const { render, renderer } = createTestRoot()
    render(<code code={"a\nb\nc"} language="ts" showHeader={false} showLineNumbers />)

    // Gutter numbers paint before their line, so the log interleaves them.
    expect(renderer.getPaintedText()).toEqual(["1", "a", "2", "b", "3", "c"])
  })

  it("keeps code text selectable", () => {
    const { render, renderer } = createTestRoot()
    render(
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <code code={"const answer = 42"} language="ts" showHeader={false} />
      </div>
    )

    const selected = renderer.dragSelect(35, 42, 900, 42)
    expect(selected).toBe("const answer = 42")
  })

  it("selects across several code lines", () => {
    const { render, renderer } = createTestRoot()
    render(
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <code code={"one\ntwo\nthree"} language="ts" showHeader={false} />
      </div>
    )

    const selected = renderer.dragSelect(35, 42, 900, 500)
    expect(selected).toBe("one\ntwo\nthree")
  })

  it("does not select the line-number gutter", () => {
    const { render, renderer } = createTestRoot()
    render(
      <div style={{ display: "flex", flexDirection: "column", padding: 20 }}>
        <code code={"alpha\nbeta"} language="ts" showHeader={false} showLineNumbers />
      </div>
    )

    // Anchor inside the code column, past the gutter, and drag to the end.
    const selected = renderer.dragSelect(70, 42, 900, 500)
    // The gutter painted this frame, but a drag must never pick it up: the
    // exact anchor column is font-dependent, the absence of digits is not.
    expect(renderer.getPaintedText()).toContain("1")
    expect(selected).not.toMatch(/\d/)
    expect(selected?.endsWith("beta")).toBe(true)
  })

  it("changes appearance when a syntax theme is applied", () => {
    const before = path.join(SHOTS_DIR, "code-theme-default.png")
    const after = path.join(SHOTS_DIR, "code-theme-custom.png")

    const a = createTestRoot()
    a.render(
      <div style={{ display: "flex", padding: 24, backgroundColor: "#060606", height: "100%" }}>
        <code code={TS_SOURCE} language="typescript" showLineNumbers />
      </div>
    )
    a.renderer.captureScreenshot(before)

    const b = createTestRoot()
    b.render(
      <div style={{ display: "flex", padding: 24, backgroundColor: "#060606", height: "100%" }}>
        <code
          code={TS_SOURCE}
          language="typescript"
          showLineNumbers
          theme={{
            syntax: {
              keyword: "#ff0000",
              string: "#00ff00",
              typeName: "#0000ff",
              comment: "#ff00ff",
            },
          }}
        />
      </div>
    )
    b.renderer.captureScreenshot(after)

    expectScreenshotsDiffer(before, after)
  })

  it("captures a reference screenshot of a highlighted block", () => {
    const shot = path.join(SHOTS_DIR, "code-typescript.png")
    const { render, renderer } = createTestRoot()
    render(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: 32,
          backgroundColor: "#060606",
          height: "100%",
        }}
      >
        <code code={TS_SOURCE} language="typescript" showLineNumbers />
      </div>
    )
    renderer.captureScreenshot(shot)

    expect(fs.existsSync(shot)).toBe(true)
    expect(fs.statSync(shot).size).toBeGreaterThan(0)
  })

  it("lets a parent scroller take a vertical wheel over a wide block", () => {
    const { render, renderer } = createTestRoot()
    render(
      <div style={{ width: 240, height: 120, overflowY: "scroll" }}>
        <code
          code={"const wide = '".padEnd(200, "x") + "'"}
          language="ts"
        />
        <div style={{ height: 400 }}>
          <text>below</text>
        </div>
      </div>
    )

    const container = renderer
      .findByType("div")
      .find((d) => d.style.overflowY === "scroll")
    expect(container).toBeDefined()
    expect(renderer.getScrollOffset(container!.id)).toEqual([0, 0])

    renderer.nativeSimulateScrollWheel(80, 50, 0, -80)
    const offset = renderer.getScrollOffset(container!.id)
    expect(offset).not.toBeNull()
    expect(offset![1]).toBeLessThan(0)
  })
})
