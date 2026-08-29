/// Persist-and-remount semantics for Solid's window render(). The retired
/// renderer suite also covered `bun --hot` subprocess reloads; Solid apps
/// build once (`vite build`) and run from dist, so that path is structurally
/// N/A here.

import { beforeEach, describe, expect, it } from "vitest"
import { createSignal } from "solid-js"
import {
  createSolidNativeTestRoot,
  hasNativeTestRenderer,
} from "../testing.js"
import type { SolidNativeTestRoot } from "../testing.js"

const describeNative = hasNativeTestRenderer ? describe : describe.skip

describeNative("render()", () => {
  let testRoot: SolidNativeTestRoot
  beforeEach(() => {
    testRoot = createSolidNativeTestRoot()
  })

  it("reuses the same renderer across renders", () => {
    const ignored = createSolidNativeTestRoot()
    testRoot.render(() => <Text>one</Text>)
    // A second root with its own renderer must not steal the first tree.
    ignored.render(() => <Text>ignored</Text>)
    expect(testRoot.getAllText()).toEqual(["one"])
    expect(ignored.getAllText()).toEqual(["ignored"])
  })

  it("replaces painted text when the entry is evaluated again", () => {
    testRoot.render(() => <Text>hello</Text>)
    expect(testRoot.getAllText()).toEqual(["hello"])

    testRoot.render(() => <Text>world</Text>)
    expect(testRoot.getAllText()).toEqual(["world"])
  })

  it("remounts when the app function identity changes", () => {
    const makeApp = (label: string) => () => <Text>{label}</Text>
    testRoot.render(makeApp("first") as never)
    expect(testRoot.getAllText()).toEqual(["first"])

    testRoot.render(makeApp("second") as never)
    expect(testRoot.getAllText()).toEqual(["second"])
  })

  it("keeps the remounted tree after deferred work", async () => {
    testRoot.render(() => <Text>before</Text>)
    expect(testRoot.getAllText()).toEqual(["before"])

    await new Promise((resolve) => setTimeout(resolve, 0))

    testRoot.render(() => <Text>after</Text>)
    expect(testRoot.getAllText()).toEqual(["after"])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(testRoot.getAllText()).toEqual(["after"])
  })
})
