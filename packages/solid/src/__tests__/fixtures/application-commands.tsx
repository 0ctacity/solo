import { createSignal, Show } from "solid-js"
import { Button, registerApplicationCommand, render, Text, View } from "@solo/solid"

function App() {
  const [count, setCount] = createSignal(0)
  const [enabled, setEnabled] = createSignal(true)
  const [registered, setRegistered] = createSignal(true)
  const [localKeys, setLocalKeys] = createSignal(0)
  const [value, setValue] = createSignal("")
  function Commands() {
    registerApplicationCommand({
      id: "refresh", label: "Refresh", shortcut: "cmd-r", menu: "Article", enabled,
      run: () => setCount((n) => n + 1),
    })
    return null
  }
  return <View style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20, width: "100%", height: "100%", backgroundColor: "#202433", color: "#ffffff" }}>
    <Show when={registered()}><Commands /></Show>
    <Text testId="count">{`Refresh: ${count()}`}</Text>
    <Text testId="enabled">{`Enabled: ${enabled()}`}</Text>
    <Text testId="registered">{`Registered: ${registered()}`}</Text>
    <Text testId="local">{`Local keys: ${localKeys()}`}</Text>
    <div testId="focus-target" tabIndex={0} style={{ padding: 12, backgroundColor: "#446644" }} onKeyDown={(event) => {
      if (event.key === "r" && event.modifiers?.cmd) setLocalKeys((n) => n + 1)
    }}><Text>Focus target (Cmd+R)</Text></div>
    <input testId="native-input" placeholder="Native input" value={value()} onChange={(event) => setValue(event.value ?? "")} style={{ width: 420, height: 40 }} />
    <Text testId="value">{`Input: ${value()}`}</Text>
    <textarea testId="native-textarea" placeholder="Native textarea" style={{ width: 420, height: 60 }} />
    <Button testId="toggle-enabled" onClick={() => setEnabled((v) => !v)}><Text>Toggle enabled</Text></Button>
    <Button testId="toggle-registration" onClick={() => setRegistered((v) => !v)}><Text>Toggle registration</Text></Button>
    <webview testId="webview" url={`data:text/html,${encodeURIComponent('<html><body style="font:18px sans-serif;background:white"><p>WKWebView focus target</p><input aria-label="Web input" placeholder="Web input" /></body></html>')}`} style={{ width: 420, height: 140 }} />
  </View>
}

render(() => <App />, { title: "Solo Commands", width: 500, height: 640 })
