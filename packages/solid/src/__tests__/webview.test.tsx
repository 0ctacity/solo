/// Protocol-level tests for `<webview>`.
///
/// These assert the mutation traffic the Solid runtime sends for a webview
/// element, which is the shared half of the feature. The WKWebView itself is
/// macOS-only and cannot be exercised headlessly — see
/// `packages/native/src/native_view/webview.rs` for what is and is not
/// covered there.
///
/// The load-bearing guarantee is that a reactive `url` change re-navigates the
/// *existing* element instead of recreating it: rebuilding the element would
/// tear down the WKWebView and reload the page from scratch.

import { describe, expect, it } from "vitest"
import { createSignal, Show } from "solid-js"
import { mountTest, findByTestId } from "../test-utils.js"

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** Every element-mutation op (ignores bookkeeping commitMutations). */
function elementOps(t: ReturnType<typeof mountTest>) {
  return t.renderer.ops.filter(([op]) => op !== "commitMutations")
}

describe("webview: element type", () => {
  it("survives as a native element type rather than collapsing to a div", () => {
    const t = mountTest(() => (
      <div>
        <webview testId="web" url="https://example.com" />
      </div>
    ))
    try {
      const el = findByTestId(t.renderer, "web")!
      expect(el.type).toBe("webview")

      const created = t.renderer.ops
        .filter(([op]) => op === "createElement")
        .map(([, , type]) => type)
      expect(created).toContain("webview")
    } finally {
      t.unmount()
    }
  })
})

describe("webview: props", () => {
  it("sends url and userAgent through setCustomProp", () => {
    const t = mountTest(() => (
      <div>
        <webview
          testId="web"
          url="https://example.com"
          userAgent="Newsprint/1.0"
        />
      </div>
    ))
    try {
      const el = findByTestId(t.renderer, "web")!
      expect(el.customProps.url).toBe("https://example.com")
      expect(el.customProps.userAgent).toBe("Newsprint/1.0")
    } finally {
      t.unmount()
    }
  })

  it("a reactive url change updates the existing element in place", async () => {
    const [url, setUrl] = createSignal("https://example.com")
    const t = mountTest(() => (
      <div>
        <webview testId="web" url={url()} />
      </div>
    ))
    try {
      const before = findByTestId(t.renderer, "web")!
      t.renderer.drainOps()

      setUrl("https://example.org")
      await tick()

      const ops = elementOps(t)
      // No createElement / destroyElement / re-parenting: the same element
      // was told to navigate, so the native view is reused.
      expect(ops.filter(([op]) => op === "createElement")).toEqual([])
      expect(ops.filter(([op]) => op === "destroyElement")).toEqual([])
      expect(
        ops.filter(([op]) => op === "appendChild" || op === "insertBefore")
      ).toEqual([])

      const urlOps = ops.filter(([op, , key]) => op === "setCustomProp" && key === "url")
      expect(urlOps).toEqual([["setCustomProp", before.id, "url", "https://example.org"]])

      const after = findByTestId(t.renderer, "web")!
      expect(after.id).toBe(before.id)
      expect(after.customProps.url).toBe("https://example.org")
    } finally {
      t.unmount()
    }
  })

  it("clearing url resets the prop rather than leaving a stale value", async () => {
    const [url, setUrl] = createSignal<string | undefined>("https://example.com")
    const t = mountTest(() => (
      <div>
        <webview testId="web" url={url()} />
      </div>
    ))
    try {
      setUrl(undefined)
      await tick()
      expect(findByTestId(t.renderer, "web")!.customProps.url).toBeUndefined()
    } finally {
      t.unmount()
    }
  })
})

describe("webview: events", () => {
  it("registers load, navigation and loadError through the shared event pipeline", () => {
    const t = mountTest(() => (
      <div>
        <webview
          testId="web"
          url="https://example.com"
          onLoad={() => {}}
          onNavigation={() => {}}
          onLoadError={() => {}}
        />
      </div>
    ))
    try {
      const el = findByTestId(t.renderer, "web")!
      expect([...el.events].sort()).toEqual(["load", "loadError", "navigation"])
    } finally {
      t.unmount()
    }
  })

  it("removing a handler unregisters exactly that event", async () => {
    const [watching, setWatching] = createSignal(true)
    const t = mountTest(() => (
      <div>
        <webview
          testId="web"
          url="https://example.com"
          onLoad={watching() ? () => {} : undefined}
          onNavigation={() => {}}
        />
      </div>
    ))
    try {
      const id = findByTestId(t.renderer, "web")!.id
      t.renderer.drainOps()

      setWatching(false)
      await tick()

      expect(t.renderer.ops).toContainEqual(["setEventListener", id, "load", false])
      expect(findByTestId(t.renderer, "web")!.events.has("load")).toBe(false)
      expect(findByTestId(t.renderer, "web")!.events.has("navigation")).toBe(true)
    } finally {
      t.unmount()
    }
  })
})

describe("webview: lifecycle", () => {
  it("unmounting destroys the element so the native view is released", async () => {
    const [shown, setShown] = createSignal(true)
    const t = mountTest(() => (
      <div>
        <Show when={shown()}>
          <webview testId="web" url="https://example.com" />
        </Show>
      </div>
    ))
    try {
      const id = findByTestId(t.renderer, "web")!.id
      t.renderer.drainOps()

      setShown(false)
      await tick()

      expect(t.renderer.ops).toContainEqual(["destroyElement", id])
      expect(findByTestId(t.renderer, "web")).toBeUndefined()
      expect(t.renderer.elements.has(id)).toBe(false)
    } finally {
      t.unmount()
    }
  })
})
