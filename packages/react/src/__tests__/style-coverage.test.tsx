/// Style props that were declared in the public type but implemented nowhere.
///
/// Each of these silently did nothing before: no error, no warning, just a prop
/// that the renderer dropped. They are easy to reintroduce, so each one gets a
/// test that fails loudly if the plumbing is removed again.

import fs from "fs"
import path from "path"
import React from "react"
import { beforeAll, describe, expect, it } from "vitest"
import { createTestRoot } from "../testing.js"
import { expectScreenshotsDiffer, SHOTS_DIR } from "./test-utils.js"

beforeAll(() => {
  fs.mkdirSync(SHOTS_DIR, { recursive: true })
})

/** Render two trees and assert the pixels differ, so a dropped prop fails. */
function comparePixels(name: string, a: React.ReactElement, b: React.ReactElement) {
  const left = path.join(SHOTS_DIR, `${name}-a.png`)
  const right = path.join(SHOTS_DIR, `${name}-b.png`)

  const first = createTestRoot()
  first.render(a)
  first.renderer.captureScreenshot(left)

  const second = createTestRoot()
  second.render(b)
  second.renderer.captureScreenshot(right)

  expectScreenshotsDiffer(left, right)
}

describe("style props reach the renderer", () => {
  it("applies padding to a <text> node", () => {
    // `<text>` used to apply a text-only subset of the style set, so every
    // layout prop on it was dropped.
    comparePixels(
      "text-padding",
      <div style={{ display: "flex", backgroundColor: "#101010", height: "100%" }}>
        <text style={{ fontSize: 20, color: "#ffffff" }}>indent me</text>
      </div>,
      <div style={{ display: "flex", backgroundColor: "#101010", height: "100%" }}>
        <text style={{ fontSize: 20, color: "#ffffff", paddingLeft: 120, paddingTop: 60 }}>
          indent me
        </text>
      </div>
    )
  })

  it("applies width and background to a <text> node", () => {
    comparePixels(
      "text-box",
      <div style={{ display: "flex", backgroundColor: "#101010", height: "100%" }}>
        <text style={{ fontSize: 20, color: "#ffffff" }}>boxed</text>
      </div>,
      <div style={{ display: "flex", backgroundColor: "#101010", height: "100%" }}>
        <text
          style={{
            fontSize: 20,
            color: "#ffffff",
            width: 300,
            height: 80,
            backgroundColor: "#7c86ff",
            borderRadius: 12,
          }}
        >
          boxed
        </text>
      </div>
    )
  })

  it("applies textAlign", () => {
    // `textAlign` was in StyleDesc and implemented nowhere.
    comparePixels(
      "text-align",
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#101010" }}>
        <text style={{ fontSize: 20, color: "#ffffff", width: 800, textAlign: "left" }}>
          aligned
        </text>
      </div>,
      <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#101010" }}>
        <text style={{ fontSize: 20, color: "#ffffff", width: 800, textAlign: "right" }}>
          aligned
        </text>
      </div>
    )
  })

  it("applies fontSize set on a div, not only on a text node", () => {
    // `fontSize` lived only in build_text, so a div that set it alongside
    // layout props had no effect on its children.
    comparePixels(
      "div-font-size",
      <div style={{ display: "flex", padding: 20, fontSize: 12, backgroundColor: "#101010" }}>
        <text style={{ color: "#ffffff" }}>inherited size</text>
      </div>,
      <div style={{ display: "flex", padding: 20, fontSize: 34, backgroundColor: "#101010" }}>
        <text style={{ color: "#ffffff" }}>inherited size</text>
      </div>
    )
  })

  it("clears a border with borderWidth 0", () => {
    // `borderWidth: 0` was skipped by a `> 0.0` guard, so an element that drew
    // its own border could never have it removed by the caller.
    comparePixels(
      "border-clear",
      <div style={{ display: "flex", padding: 20, backgroundColor: "#101010" }}>
        <div style={{ width: 300, height: 100, borderWidth: 6, borderColor: "#ff0000" }} />
      </div>,
      <div style={{ display: "flex", padding: 20, backgroundColor: "#101010" }}>
        <div style={{ width: 300, height: 100, borderWidth: 0, borderColor: "#ff0000" }} />
      </div>
    )
  })

  it("applies rowGap and columnGap", () => {
    // Both were in StyleDesc and implemented nowhere; only `gap` worked.
    const boxes = [0, 1, 2, 3].map((i) => (
      <div key={i} style={{ width: 120, height: 60, backgroundColor: "#7c86ff" }} />
    ))
    comparePixels(
      "axis-gap",
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: 300,
          padding: 20,
          backgroundColor: "#101010",
        }}
      >
        {boxes}
      </div>,
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          width: 300,
          padding: 20,
          rowGap: 40,
          columnGap: 24,
          backgroundColor: "#101010",
        }}
      >
        {boxes}
      </div>
    )
  })
})
