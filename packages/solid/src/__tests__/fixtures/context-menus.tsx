import { createSignal, onCleanup, Show } from "solid-js"
import { Button, createContextMenu, render, Text, View } from "@solo/solid"

function App() {
  let shuttingDown = false
  let reportedShutdownTick = false
  const [ticks, setTicks] = createSignal(0)
  const [status, setStatus] = createSignal("Ready")
  const [visible, setVisible] = createSignal(true)
  const timer = setInterval(() => {
    setTicks((n) => n + 1)
    if (shuttingDown && !reportedShutdownTick) {
      reportedShutdownTick = true
      console.error("shutdown-tick")
    }
  }, 25)
  onCleanup(() => clearInterval(timer))
  const menu = createContextMenu([
    { id: "disabled", label: "Unavailable", disabled: true },
    { type: "separator" },
    { id: "read", label: "Mark read", checked: true },
  ])
  return <View style={{ display: "flex", flexDirection: "column", gap: 12, padding: 24 }}>
    <Text testId="ticks">{`Ticks: ${ticks()}`}</Text>
    <Text testId="status">{status()}</Text>
    <Show when={visible()}>
      <Button testId="owner" onClick={(event) => {
        setStatus("Menu pending")
        void menu.show(event).then((id) => setStatus(id ?? "Cancelled"), (e) => setStatus(String(e)))
      }}><Text>Open native menu</Text></Button>
    </Show>
    <Button testId="remove" onClick={() => setVisible(false)}><Text>Remove owner</Text></Button>
    <Button testId="restore" onClick={() => setVisible(true)}><Text>Restore owner</Text></Button>
    <Button testId="close" onClick={() => { shuttingDown = true; root.closeWindow() }}><Text>Close window</Text></Button>
    <Button testId="quit" onClick={() => { shuttingDown = true; root.quitApplication() }}><Text>Quit application</Text></Button>
  </View>
}

const root = render(() => <App />, { title: "Solo Menus", width: 550, height: 400 })
