import { createSignal, onCleanup } from "solid-js"
import { Button, registerApplicationCommand, render, selectFiles, selectSavePath, Text, View } from "@solo/solid"

function App() {
  const [ticks, setTicks] = createSignal(0)
  const [status, setStatus] = createSignal("Ready")
  const timer = setInterval(() => {
    setTicks((value) => value + 1)
    console.error("dialog-heartbeat")
  }, 25)
  onCleanup(() => clearInterval(timer))
  const open = () => {
    setStatus("Open pending")
    void selectFiles({ multiple: true, prompt: "Import" }).then(
      (paths) => setStatus(paths ? `Open: ${paths.join(" | ")}` : "Open cancelled"),
      (error: unknown) => setStatus(`Open error: ${String(error)}`),
    )
  }
  const save = () => {
    setStatus("Save pending")
    void selectSavePath({ suggestedName: "Newsprint Notes 世界.md", initialDirectory: "/tmp" }).then(
      (path) => setStatus(path ? `Save: ${path}` : "Save cancelled"),
      (error: unknown) => setStatus(`Save error: ${String(error)}`),
    )
  }
  registerApplicationCommand({ id: "dialog-open", label: "Select files", shortcut: "cmd-o", menu: "Dialog", run: open })
  registerApplicationCommand({ id: "dialog-save", label: "Choose save path", shortcut: "cmd-s", menu: "Dialog", run: save })
  return <View style={{ display: "flex", flexDirection: "column", gap: 14, padding: 24, width: "100%", height: "100%" }}>
    <Text>Native file dialog verification</Text>
    <Text testId="status">{status()}</Text>
    <Text testId="ticks">{`Ticks: ${ticks()}`}</Text>
    <View style={{ display: "flex", gap: 10 }}>
      <Button testId="open" onClick={open}><Text>Select files</Text></Button>
      <Button testId="save" onClick={save}><Text>Choose save path</Text></Button>
    </View>
  </View>
}

render(() => <App />, { title: "Solo Dialogs", width: 560, height: 300 })
