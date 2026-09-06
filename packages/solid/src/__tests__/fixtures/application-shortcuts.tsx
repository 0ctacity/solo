import { createSignal, Show } from "solid-js"
import { Button, registerApplicationCommand, render, Text } from "@solo/solid"
import type { WebviewController } from "@solo/solid"

function App() {
  let article!: { id: number }
  const [hasArticle, setHasArticle] = createSignal(false)
  let webview!: WebviewController
  const [log, setLog] = createSignal<string[]>([])
  const [enabled, setEnabled] = createSignal(true)
  const [registered, setRegistered] = createSignal(true)
  const [value, setValue] = createSignal("")
  const [webStatus, setWebStatus] = createSignal("Waiting")
  const append = (key: string) => setLog((values) => [...values, key])
  registerApplicationCommand({ id: "global", label: "Global", shortcut: "cmd-r", menu: "Article", run: () => append("global") })
  registerApplicationCommand({ id: "unmodified", label: "Unmodified", shortcut: "u", run: () => append("u") })
  async function focusWebview() {
    try {
      await webview.ready()
      const selector = webStatus() === "INPUT" ? "div" : "input"
      const value = await webview.evaluateJavaScript(`(() => { document.querySelector('${selector}').focus(); return document.activeElement.tagName })()`)
      setWebStatus(String(value))
    } catch (error) { setWebStatus(String(error)) }
  }
  function Commands() {
    for (const shortcut of ["space", "s", "h", "o", "cmd-option-p", "j"]) {
      registerApplicationCommand({
        id: shortcut, label: shortcut, shortcut, scopeElementId: article.id,
        enabled, allowRepeat: shortcut === "j", run: () => append(shortcut),
      })
    }
    let rejected = 0
    for (const shortcut of ["alt-super-p", "cmd-c"]) {
      try { registerApplicationCommand({ id: `invalid-${shortcut}`, label: "Invalid", shortcut, run() {} }) }
      catch { rejected++ }
    }
    return <Text testId="validation">{`Rejected: ${rejected}`}</Text>
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, width: "100%", height: "100%" }}>
    <Show when={registered() && hasArticle()}><Commands /></Show>
    <Text testId="log">{log().join(",") || "Empty"}</Text>
    <div ref={(node: { id: number }) => { article = node; setHasArticle(true) }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div testId="article" tabIndex={0} style={{ height: 40 }}>Article focus</div>
      <input testId="input" value={value()} onChange={(event) => setValue(event.value ?? "")} style={{ height: 40 }} />
      <textarea testId="textarea" style={{ height: 60 }} />
      <Button testId="button" tabIndex={0} onClick={() => append("button")}>Focused button</Button>
      <Button testId="web-focus" onClick={() => { void focusWebview() }}>Focus WebView editor</Button>
    </div>
    <Text testId="value">{value() || "Empty"}</Text>
    <div testId="outside" tabIndex={0} style={{ height: 40 }}>Outside article</div>
    <Button testId="enabled" onClick={() => setEnabled((value) => !value)}>{String(enabled())}</Button>
    <Button testId="registered" onClick={() => setRegistered((value) => !value)}>{String(registered())}</Button>
    <Text testId="web-status">{webStatus()}</Text>
    <webview ref={(controller) => { webview = controller }} html="<input value='editable'><div contenteditable>Composition target</div>" style={{ height: 90 }} />
  </div>
}
render(() => <App />, { title: "Solo Shortcuts", width: 500, height: 720 })
