/// macOS-only GPU-backed tests for `<webview>`.
///
/// Deliberately narrow. These cover what the headless protocol tests cannot:
/// that the element takes real layout space and that a prop change reuses the
/// same node (and therefore the same WKWebView). Loading an actual page is not
/// tested — it needs network, and asserting on rendered web content is not
/// something Solo's automation tree can see.
///
/// Skipped off macOS: `hasNativeTestRenderer` is false and the element is not
/// registered on other platforms.

import { beforeEach, describe, expect, it } from "vitest"
import { createSignal } from "solid-js"
import {
  createSolidNativeTestRoot,
  hasNativeTestRenderer,
} from "../testing.js"
import type { SolidNativeTestRoot } from "../testing.js"

const describeNative = hasNativeTestRenderer ? describe : describe.skip

describeNative("custom element: webview", () => {
  let testRoot: SolidNativeTestRoot

  beforeEach(() => {
    testRoot = createSolidNativeTestRoot()
  })

  it("takes part in layout like any other element", () => {
    testRoot.render(() => (
      <div style={{ width: 400, height: 300 }}>
        <webview testId="web" style={{ flexGrow: 1, minHeight: 0 }} />
      </div>
    ))

    const found = testRoot.findByType("webview")
    expect(found.length).toBe(1)

    const bounds = testRoot.getElementBounds(found[0]!.id)
    expect(bounds).not.toBeNull()
    const [, , width, height] = bounds!
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
  })

  it("a prop change reuses the same node", () => {
    // `userAgent` rather than `url` so the test never navigates: the guarantee
    // under test is node identity, and a rebuild would be visible either way.
    const [agent, setAgent] = createSignal("A/1.0")
    testRoot.render(() => (
      <div style={{ width: 400, height: 300 }}>
        <webview testId="web" userAgent={agent()} style={{ flexGrow: 1 }} />
      </div>
    ))

    const before = testRoot.findByType("webview")[0]!
    setAgent("B/2.0")
    testRoot.render(() => (
      <div style={{ width: 400, height: 300 }}>
        <webview testId="web" userAgent={agent()} style={{ flexGrow: 1 }} />
      </div>
    ))

    const after = testRoot.findByType("webview")
    expect(after.length).toBe(1)
    expect(after[0]!.id).toBe(before.id)
  })
})
