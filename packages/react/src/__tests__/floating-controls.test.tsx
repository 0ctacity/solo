/** End-to-end tests for headless floating controls over the native GPUI pipeline. */
// @ts-nocheck

import React, { useState } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  createTestRoot,
  hasNativeTestRenderer,
} from "../index"

const describeNative = hasNativeTestRenderer ? describe : describe.skip

const triggerStyle = {
  width: 180,
  height: 36,
  padding: 8,
  backgroundColor: "#27324a",
  color: "#ffffff",
}

const contentStyle = {
  width: 180,
  maxHeight: 150,
  overflowY: "scroll",
  padding: 4,
  backgroundColor: "#111827",
  color: "#ffffff",
}

const itemStyle = ({ highlighted, selected, disabled }) => ({
  height: 32,
  padding: 6,
  opacity: disabled ? 0.4 : 1,
  backgroundColor: highlighted ? "#334155" : selected ? "#1e3a5f" : "#111827",
})

describeNative("floating controls", () => {
  let testRoot: ReturnType<typeof createTestRoot>

  beforeEach(() => {
    testRoot = createTestRoot()
  })

  it("composes a headless Select and supports keyboard selection", () => {
    function Demo() {
      const [value, setValue] = useState("alpha")
      return (
        <div style={{ width: 400, height: 300, padding: 12 }}>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger style={triggerStyle}>
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent side="bottom" sideOffset={4} style={contentStyle}>
              <SelectGroup>
                <SelectLabel style={{ height: 24 }}>Models</SelectLabel>
                <SelectItem value="alpha" style={itemStyle}>Alpha</SelectItem>
                <SelectItem value="disabled" disabled style={itemStyle}>Disabled</SelectItem>
                <SelectSeparator style={{ height: 1, backgroundColor: "#475569" }} />
                <SelectItem value="beta" style={itemStyle}>Beta</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <text>{`Value: ${value}`}</text>
        </div>
      )
    }

    testRoot.render(<Demo />)
    expect(testRoot.renderer.getAllText()).toMatchInlineSnapshot(`
      [
        "Alpha",
        "Value: alpha",
      ]
    `)

    testRoot.renderer.nativeSimulateClick(30, 25)
    expect(testRoot.renderer.getAllText()).toContain("Beta")

    testRoot.renderer.simulateKeystrokes("down")
    testRoot.renderer.simulateKeystrokes("enter")

    expect(testRoot.renderer.getAllText()).toMatchInlineSnapshot(`
      [
        "Beta",
        "Value: beta",
      ]
    `)
  })

  it("closes a Select from its trigger without reopening on the same press", () => {
    function Demo() {
      return (
        <div style={{ width: 400, height: 260, padding: 12 }}>
          <Select defaultValue="one">
            <SelectTrigger style={triggerStyle}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent sideOffset={4} style={contentStyle}>
              <SelectItem value="one" style={itemStyle}>One</SelectItem>
              <SelectItem value="two" style={itemStyle}>Two</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )
    }

    testRoot.render(<Demo />)
    testRoot.renderer.nativeSimulateClick(30, 25)
    expect(testRoot.renderer.getAllText()).toContain("Two")

    testRoot.renderer.nativeSimulateClick(30, 25)
    expect(testRoot.renderer.getAllText()).toEqual(["One"])
  })

  it("occludes controls behind SelectContent", () => {
    function Demo() {
      const [clicks, setClicks] = useState(0)
      const [value, setValue] = useState("one")
      return (
        <div style={{ width: 400, height: 260, position: "relative", padding: 12 }}>
          <div
            style={{ position: "absolute", top: 52, left: 12, width: 180, height: 90 }}
            onClick={() => setClicks((count) => count + 1)}
          >
            <text>Behind</text>
          </div>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger style={triggerStyle}><SelectValue /></SelectTrigger>
            <SelectContent sideOffset={4} style={contentStyle}>
              <SelectItem value="one" style={itemStyle}>One</SelectItem>
              <SelectItem value="two" style={itemStyle}>Two</SelectItem>
            </SelectContent>
          </Select>
          <text>{`Behind clicks: ${clicks}`}</text>
        </div>
      )
    }

    testRoot.render(<Demo />)
    testRoot.renderer.nativeSimulateClick(30, 25)
    testRoot.renderer.nativeSimulateClick(30, 104)

    expect(testRoot.renderer.getAllText()).toContain("Behind clicks: 0")
    expect(testRoot.renderer.getAllText()).toContain("Two")
  })

  it("filters and selects through the shadcn Combobox shape", () => {
    const frameworks = ["Astro", "SvelteKit", "Next.js"]

    function Demo() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <div style={{ width: 400, height: 300, padding: 12 }}>
          <Combobox items={frameworks} value={value} onValueChange={setValue}>
            <ComboboxInput
              placeholder="Select a framework"
              style={triggerStyle}
            />
            <ComboboxContent sideOffset={4} style={contentStyle}>
              <ComboboxEmpty>No items found.</ComboboxEmpty>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item} value={item} style={itemStyle}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <text>{`Selected: ${value ?? "none"}`}</text>
        </div>
      )
    }

    testRoot.render(<Demo />)
    const input = testRoot.renderer.findByType("input")[0]
    testRoot.renderer.nativeSimulateClick(30, 25)
    testRoot.renderer.nativeSimulateKeystrokes(input.id, "s")

    expect(testRoot.renderer.getAllText()).toMatchInlineSnapshot(`
      [
        "SvelteKit",
        "Astro",
        "Next.js",
        "Selected: none",
      ]
    `)

    testRoot.renderer.nativeSimulateKeystrokes(input.id, "down")
    testRoot.renderer.nativeSimulateKeystrokes(input.id, "enter")

    expect(testRoot.renderer.getAllText()).toContain("Selected: SvelteKit")
  })

  it("renders ComboboxEmpty when filtering removes every item", () => {
    function Demo() {
      return (
        <div style={{ width: 400, height: 240, padding: 12 }}>
          <Combobox items={["Alpha", "Beta"]}>
            <ComboboxInput style={triggerStyle} />
            <ComboboxContent sideOffset={4} style={contentStyle}>
              <ComboboxEmpty>Nothing found</ComboboxEmpty>
              <ComboboxList>
                {(item) => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      )
    }

    testRoot.render(<Demo />)
    const input = testRoot.renderer.findByType("input")[0]
    testRoot.renderer.nativeSimulateClick(30, 25)
    testRoot.renderer.nativeSimulateKeystrokes(input.id, "z")

    expect(testRoot.renderer.getAllText()).toContain("Nothing found")
  })

  it("skips disabled Combobox items during keyboard navigation", () => {
    function Demo() {
      const [value, setValue] = useState<string | null>(null)
      const items = ["Disabled", "Enabled"]
      return (
        <div style={{ width: 400, height: 240, padding: 12 }}>
          <Combobox items={items} value={value} onValueChange={setValue}>
            <ComboboxInput style={triggerStyle} />
            <ComboboxContent sideOffset={4} style={contentStyle}>
              <ComboboxList>
                {(item) => (
                  <ComboboxItem key={item} value={item} disabled={item === "Disabled"}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <text>{`Selected: ${value ?? "none"}`}</text>
        </div>
      )
    }

    testRoot.render(<Demo />)
    const input = testRoot.renderer.findByType("input")[0]
    testRoot.renderer.nativeSimulateClick(30, 25)
    testRoot.renderer.nativeSimulateKeystrokes(input.id, "down")
    testRoot.renderer.nativeSimulateKeystrokes(input.id, "enter")

    expect(testRoot.renderer.getAllText()).toContain("Selected: Enabled")
  })

  it("does not select from a disabled Combobox", () => {
    function Demo() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <div style={{ width: 400, height: 240 }}>
          <Combobox disabled items={["Alpha"]} value={value} onValueChange={setValue}>
            <ComboboxInput style={triggerStyle} />
            <ComboboxContent><ComboboxList>{(item) => (
              <ComboboxItem key={item} value={item}>{item}</ComboboxItem>
            )}</ComboboxList></ComboboxContent>
          </Combobox>
          <text>{`Selected: ${value ?? "none"}`}</text>
        </div>
      )
    }

    testRoot.render(<Demo />)
    const input = testRoot.renderer.findByType("input")[0]
    testRoot.renderer.nativeSimulateKeystrokes(input.id, "down enter")

    expect(testRoot.renderer.getAllText()).toContain("Selected: none")
  })

  it("opens and closes a Tooltip from native hover events", () => {
    let triggerRef = null

    function Demo() {
      return (
        <div style={{ width: 400, height: 240, padding: 12 }}>
          <TooltipProvider delayDuration={0} disableHoverableContent>
            <Tooltip>
              <TooltipTrigger asChild>
                <div ref={(instance) => { triggerRef = instance }} style={triggerStyle}>
                  Hover me
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                sideOffset={4}
                style={{ width: 120, height: 28, padding: 6, backgroundColor: "#020617" }}
              >
                Tooltip body
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )
    }

    testRoot.render(<Demo />)
    expect(triggerRef).not.toBeNull()
    expect(testRoot.renderer.getAllText()).toEqual(["Hover me"])

    testRoot.renderer.nativeSimulateMouseMove(30, 25)
    expect(testRoot.renderer.getAllText()).toContain("Tooltip body")

    const trigger = testRoot.renderer
      .findByType("div")
      .find((element) => element.events.has("mouseEnter"))!
    testRoot.renderer.nativeSimulateKeyDown(trigger.id, "escape")
    expect(testRoot.renderer.getAllText()).toEqual(["Hover me"])

    testRoot.renderer.nativeSimulateMouseMove(30, 25)
    testRoot.renderer.nativeSimulateMouseMove(300, 180)
    expect(testRoot.renderer.getAllText()).toEqual(["Hover me"])
  })

  it("moves through tab-indexed controls", () => {
    function Demo() {
      const [focused, setFocused] = useState("none")
      return (
        <div style={{ width: 400, height: 160 }}>
          <div
            autoFocus
            tabIndex={0}
            style={{ width: 100, height: 32 }}
            onKeyDown={() => setFocused("first")}
          >
            First
          </div>
          <div
            tabIndex={0}
            style={{ width: 100, height: 32 }}
            onKeyDown={() => setFocused("second")}
          >
            Second
          </div>
          <text>{`Focused: ${focused}`}</text>
        </div>
      )
    }

    testRoot.render(<Demo />)
    testRoot.renderer.simulateKeystrokes("tab a")

    expect(testRoot.renderer.getAllText()).toContain("Focused: second")
  })

  it("removes an element from tab order when tabIndex is removed", () => {
    function Demo() {
      const [secondEnabled, setSecondEnabled] = useState(true)
      const [focused, setFocused] = useState("none")
      return (
        <div style={{ width: 400, height: 160 }}>
          <div
            autoFocus
            tabIndex={0}
            style={{ width: 100, height: 32 }}
            onClick={() => setSecondEnabled(false)}
            onKeyDown={() => setFocused("first")}
          >
            First
          </div>
          <div
            tabIndex={secondEnabled ? 0 : undefined}
            style={{ width: 100, height: 32 }}
            onKeyDown={() => setFocused("second")}
          >
            Second
          </div>
          <text>{`Focused: ${focused}`}</text>
        </div>
      )
    }

    testRoot.render(<Demo />)
    testRoot.renderer.nativeSimulateClick(30, 16)
    testRoot.renderer.simulateKeystrokes("tab a")

    expect(testRoot.renderer.getAllText()).toContain("Focused: first")
  })
})
