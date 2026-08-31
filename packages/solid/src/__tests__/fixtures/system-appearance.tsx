import { createSignal, Show } from "solid-js"
import { Button, createSystemAppearance, registerApplicationCommand, render, Text, View } from "@solo/solid"
import type { SystemAppearance } from "@solo/solid"

let mounts = 0

function App() {
  const system = createSystemAppearance()
  const [preference, setPreference] = createSignal<"system" | SystemAppearance>("system")
  const effective = (): SystemAppearance => {
    const choice = preference()
    return choice === "system" ? system() : choice
  }
  const mountId = ++mounts
  for (const choice of ["system", "light", "dark"] as const) {
    registerApplicationCommand({
      id: `theme-${choice}`, label: choice === "system" ? "Follow System" : `Explicit ${choice}`,
      menu: "Theme", run: () => setPreference(choice),
    })
  }
  return <View testId="surface" style={{ display: "flex", flexDirection: "column", padding: 24, gap: 14, width: "100%", height: "100%", backgroundColor: effective() === "dark" ? "#202433" : "#f7f8fa", color: effective() === "dark" ? "#f7f8fa" : "#202433" }}>
    <Text>System appearance verification</Text>
    <Text testId="system">{`System: ${system()}`}</Text>
    <Text testId="preference">{`Preference: ${preference()}`}</Text>
    <Text testId="effective">{`Effective: ${effective()}`}</Text>
    <Text testId="mount">{`Mount: ${mountId}`}</Text>
    <View style={{ display: "flex", gap: 8 }}>
      <Button testId="follow" onClick={() => setPreference("system")}><Text>Follow System</Text></Button>
      <Button testId="light" onClick={() => setPreference("light")}><Text>Light</Text></Button>
      <Button testId="dark" onClick={() => setPreference("dark")}><Text>Dark</Text></Button>
    </View>
    <input testId="editor" value="Existing native theme override" theme={{ appearance: effective() }} style={{ width: 500, height: 46 }} />
  </View>
}

function Host() {
  const [visible, setVisible] = createSignal(true)
  registerApplicationCommand({
    id: "toggle-observer", label: "Toggle appearance component", menu: "Theme", shortcut: "cmd-t",
    run: () => setVisible((value) => !value),
  })
  return <Show when={visible()}><App /></Show>
}

render(() => <Host />, { title: "Solo Appearance", width: 600, height: 440 })
