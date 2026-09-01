import { dirname, resolve } from "node:path"
import { createSignal, onCleanup } from "solid-js"
import { Button, render, Text, View } from "@solo/solid"
import type { Root } from "@solo/solid"

const background = process.env.SOLO_BACKGROUND !== "0"
let root: Root

function App() {
  const [ticks, setTicks] = createSignal(0)
  const timer = setInterval(() => setTicks((value) => value + 1), 25)
  onCleanup(() => clearInterval(timer))
  const close = () => {
    root.closeWindow()
    if (background) {
      setTimeout(() => {
        console.error("background:timer-progressed")
        root.showWindow()
        console.error("background:window-reopened")
      }, 300)
    }
  }
  return <View style={{ display: "flex", gap: 8, padding: 16 }}>
    <Text testId="ticks">Ticks: {ticks()}</Text>
    <Button testId="close" onClick={close}>Close</Button>
    <Button testId="quit" onClick={() => root.quitApplication()}>Quit</Button>
  </View>
}

root = render(() => <App />, background ? {
  title: "Solo Background",
  menuBar: {
    iconPath: resolve(dirname(process.execPath), "../Resources/menu.png"),
    tooltip: "Solo Background",
  },
} : { title: "Solo Default Lifecycle" })
