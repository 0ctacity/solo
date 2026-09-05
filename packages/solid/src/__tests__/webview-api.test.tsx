/// Contract tests for the lifecycle-safe public WebView API.

import { createSignal } from "solid-js"
import { describe, expect, it } from "vitest"
import { MockNativeRenderer } from "@solo/core"
import { mountTest } from "../test-utils.js"
import type { WebviewController } from "../webview.js"

class WebviewRenderer extends MockNativeRenderer {
  evaluations: Array<[number, string]> = []
  navigationDecisions: Array<[string, number, number]> = []
  nextEvaluation: Promise<string> | null = null
  nextReady: Promise<number> | null = null
  readyAttempts = 0
  failFirstReadyAsUnmounted = false

  override evaluateWebviewJavaScript(id: number, script: string): Promise<string> {
    this.evaluations.push([id, script])
    return this.nextEvaluation ?? Promise.resolve("null")
  }

  override allowWebviewNavigation(id: number, navigationId: number): void {
    this.navigationDecisions.push(["allow", id, navigationId])
  }

  override cancelWebviewNavigation(id: number, navigationId: number): void {
    this.navigationDecisions.push(["cancel", id, navigationId])
  }

  override waitWebviewReady(id: number): Promise<number> {
    void id
    this.readyAttempts += 1
    if (this.failFirstReadyAsUnmounted && this.readyAttempts === 1) {
      throw new Error(`WebView ${id} is not mounted`)
    }
    return this.nextReady ?? Promise.resolve(1)
  }
}

describe("webview public API", () => {
  it("forwards generated HTML and its optional base URL", () => {
    const t = mountTest(() => (
      <webview
        testId="reader"
        html="<a href='chapter/2.html'>Next</a>"
        baseUrl="https://newsprint.example/articles/1/"
      />
    ))

    try {
      const webview = t.renderer.findByType("webview")[0]
      expect(webview?.customProps.html).toBe("<a href='chapter/2.html'>Next</a>")
      expect(webview?.customProps.baseUrl).toBe("https://newsprint.example/articles/1/")
    } finally {
      t.unmount()
    }
  })

  it("rejects URL and generated HTML being supplied together", () => {
    expect(() =>
      mountTest(() => (
        <webview
          url="https://newsprint.example/article"
          html="<p>Article</p>"
        />
      ))
    ).toThrow(/mutually exclusive/i)
  })

  it("exposes one stable controller while the document source changes", async () => {
    const [html, setHtml] = createSignal("<p>one</p>")
    let controller: {
      evaluateJavaScript: (script: string) => Promise<unknown>
    } | undefined
    const t = mountTest(() => (
      <webview
        html={html()}
        ref={(value) => {
          controller = value
        }}
      />
    ))

    try {
      const first = controller
      expect(first?.evaluateJavaScript).toBeTypeOf("function")
      setHtml("<p>two</p>")
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(controller).toBe(first)
    } finally {
      t.unmount()
    }
  })

  it("allows an atomic reactive transition between URL and generated HTML", async () => {
    const [html, setHtml] = createSignal<string | undefined>("<p>one</p>")
    const [url, setUrl] = createSignal<string | undefined>()
    const t = mountTest(() => <webview html={html()} url={url()} />)

    try {
      setHtml(undefined)
      setUrl("https://newsprint.example/article")
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      const webview = t.renderer.findByType("webview")[0]
      expect(webview?.customProps.html).toBeUndefined()
      expect(webview?.customProps.url).toBe("https://newsprint.example/article")

      setUrl(undefined)
      setHtml("<p>two</p>")
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(webview?.customProps.url).toBeUndefined()
      expect(webview?.customProps.html).toBe("<p>two</p>")
    } finally {
      t.unmount()
    }
  })

  it("decodes structured evaluation results and awaits promises", async () => {
    const renderer = new WebviewRenderer()
    renderer.nextEvaluation = Promise.resolve(
      JSON.stringify({ title: "Article", count: 3, tags: ["solo", "solid"] })
    )
    let controller: WebviewController | undefined
    const t = mountTest(
      () => <webview html="<p>Article</p>" ref={(value) => (controller = value)} />,
      renderer
    )

    try {
      await expect(controller!.evaluateJavaScript("Promise.resolve(document.title)"))
        .resolves.toEqual({ title: "Article", count: 3, tags: ["solo", "solid"] })
      expect(renderer.evaluations).toEqual([
        [controller!.id, "Promise.resolve(document.title)"],
      ])
    } finally {
      t.unmount()
    }
  })

  it("waits for the intended document generation to become ready", async () => {
    const renderer = new WebviewRenderer()
    let resolveReady: ((generation: number) => void) | undefined
    renderer.nextReady = new Promise((resolve) => {
      resolveReady = resolve
    })
    let controller: WebviewController | undefined
    const t = mountTest(
      () => <webview html="<p>Article</p>" ref={(value) => (controller = value)} />,
      renderer
    )

    try {
      const ready = controller!.ready()
      resolveReady!(1)
      await expect(ready).resolves.toBeUndefined()
      expect(controller!.isMounted()).toBe(true)
    } finally {
      t.unmount()
    }
  })

  it("waits through the first native paint when readiness is requested immediately", async () => {
    const renderer = new WebviewRenderer()
    renderer.failFirstReadyAsUnmounted = true
    let controller: WebviewController | undefined
    const t = mountTest(
      () => <webview html="<p>Article</p>" ref={(value) => (controller = value)} />,
      renderer
    )

    try {
      await expect(controller!.ready()).resolves.toBeUndefined()
      expect(renderer.readyAttempts).toBe(2)
    } finally {
      t.unmount()
    }
  })

  it("invalidates readiness when the document changes", async () => {
    const [html, setHtml] = createSignal("<p>one</p>")
    const renderer = new WebviewRenderer()
    renderer.nextReady = new Promise(() => {})
    let controller: WebviewController | undefined
    const t = mountTest(
      () => <webview html={html()} ref={(value) => (controller = value)} />,
      renderer
    )

    try {
      const ready = controller!.ready()
      setHtml("<p>two</p>")
      await expect(ready).rejects.toThrow(/document changed/i)
    } finally {
      t.unmount()
    }
  })

  it("normalizes undefined to null and rejects malformed results and JS errors", async () => {
    const renderer = new WebviewRenderer()
    let controller: WebviewController | undefined
    const t = mountTest(
      () => <webview html="<p>Article</p>" ref={(value) => (controller = value)} />,
      renderer
    )

    try {
      renderer.nextEvaluation = Promise.resolve("null")
      await expect(controller!.evaluateJavaScript("undefined")).resolves.toBeNull()

      renderer.nextEvaluation = Promise.resolve("undefined")
      await expect(controller!.evaluateJavaScript("({})")).rejects.toThrow(/invalid JSON/i)

      renderer.nextEvaluation = Promise.reject(new Error("ReferenceError: missing"))
      await expect(controller!.evaluateJavaScript("missing")).rejects.toThrow(/missing/)
    } finally {
      t.unmount()
    }
  })

  it("settles pending evaluations when the document changes or unmounts", async () => {
    const [html, setHtml] = createSignal("<p>one</p>")
    const renderer = new WebviewRenderer()
    let resolveEvaluation: ((value: string) => void) | undefined
    renderer.nextEvaluation = new Promise((resolve) => {
      resolveEvaluation = resolve
    })
    let controller: WebviewController | undefined
    const t = mountTest(
      () => <webview html={html()} ref={(value) => (controller = value)} />,
      renderer
    )

    try {
      const evaluation = controller!.evaluateJavaScript("document.body.innerHTML")
      setHtml("<p>two</p>")
      await expect(evaluation).rejects.toThrow(/document changed/i)
      resolveEvaluation!(JSON.stringify("late"))

      renderer.nextEvaluation = new Promise(() => {})
      const afterUnmount = controller!.evaluateJavaScript("document.title")
      t.unmount()
      await expect(afterUnmount).rejects.toThrow(/unmounted/i)
      expect(controller!.isMounted()).toBe(false)
    } finally {
      t.unmount()
    }
  })

  it("routes explicit navigation decisions through the stable controller", () => {
    const renderer = new WebviewRenderer()
    let controller: WebviewController | undefined
    const t = mountTest(
      () => (
        <webview
          html="<a href='article/2'>Article</a>"
          onNavigationRequest={() => {}}
          ref={(value) => (controller = value)}
        />
      ),
      renderer
    )

    try {
      controller!.allowNavigation(7)
      controller!.cancelNavigation(8)
      expect(renderer.navigationDecisions).toEqual([
        ["allow", controller!.id, 7],
        ["cancel", controller!.id, 8],
      ])
    } finally {
      t.unmount()
    }
  })
})
