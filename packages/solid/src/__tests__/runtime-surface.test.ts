/// Contract test: @solidjs/babel-plugin compiles JSX to named imports from
/// "@solo/solid/runtime" (see scripts/solid-universal-plugin.ts). If any of
/// these exports disappears, every compiled app fails at import time —
/// as found by the tasks dogfood example, which resolves this module
/// through the package instead of an alias to src.
import { describe, expect, it } from "vitest"
import * as runtime from "../runtime.js"
import { solidUniversal } from "../vite.js"

describe("runtime module compiler surface", () => {
  it("exports every function @solidjs/babel-plugin can emit", () => {
    const required = [
      // ops emitted by { generate: "universal" }
      "createElement",
      "createTextNode",
      "insertNode",
      "insert",
      "spread",
      "setProp",
      "effect",
      "memo",
      "createComponent",
      // emitted for JSX spreads and refs
      "mergeProps",
      "ref",
      "applyRef",
      // control flow forwarded from solid-js
      "Show",
      "For",
      "Switch",
      "Match",
    ]
    for (const name of required) {
      expect(runtime, name).toHaveProperty(name)
    }
  })

  it("exports the RC.4 patch-mode helpers", () => {
    expect(runtime, "rowProof").toHaveProperty("rowProof")
    expect(runtime, "patchDriver").toHaveProperty("patchDriver")
  })

  it("compiles eligible intrinsic rows with patch-mode metadata", () => {
    const plugin = solidUniversal()
    const transform = plugin.transform
    if (typeof transform !== "function") {
      throw new Error("solidUniversal must provide a transform hook")
    }

    const output = transform.call(
      {} as never,
      `
        import { For } from "solid-js"
        function App(props) {
          return <For each={props.items}>{row => <div data-id={row.id}>row</div>}</For>
        }
      `,
      "/fixture.tsx",
    )
    const code = typeof output === "string" ? output : output?.code
    expect(code).toMatch(/rowProof/)
    expect(code).toMatch(/patchDriver/)
  })

  it("carries a pure-row proof on an extracted row function", () => {
    const plugin = solidUniversal()
    const transform = plugin.transform
    if (typeof transform !== "function") {
      throw new Error("solidUniversal must provide a transform hook")
    }
    const output = transform.call(
      {} as never,
      `
        import { For } from "solid-js"
        const Row = row => <div data-id={row.id}>row</div>
        function App(props) {
          return <For each={props.items}>{Row}</For>
        }
      `,
      "/fixture.tsx",
    )
    const code = typeof output === "string" ? output : output?.code
    expect(code).toMatch(/Row\s*=\s*.*rowProof|Row\s*=\s*rowProof/s)
    expect(code).toMatch(/patchDriver/)
  })

  it("proves a block row whose only user statement is its intrinsic return", () => {
    const plugin = solidUniversal()
    const transform = plugin.transform
    if (typeof transform !== "function") {
      throw new Error("solidUniversal must provide a transform hook")
    }
    const output = transform.call(
      {} as never,
      `
        import { For } from "solid-js"
        function App(props) {
          return <For each={props.items}>{row => {
            return <div data-id={row.id}>row</div>
          }}</For>
        }
      `,
      "/fixture.tsx",
    )
    const code = typeof output === "string" ? output : output?.code
    expect(code).toMatch(/rowProof/)
    expect(code).toMatch(/patchDriver/)
  })

  it.each([
    ["component rows", "<Row item={row}/>", "function Row(props) { return <div>{props.item.id}</div> }"],
    ["explicit key functions", "<div>{row.title}</div>", ""],
    ["index accessors", "<div>{row.title}:{index}</div>", ""],
    ["fallback rows", "<div>{row.title}</div>", ""],
    ["fragments", "<><div data-id={row.id}/><div/></>", ""],
    ["spreads", "<div {...row}/>", ""],
    ["refs", "<div ref={row.ref}/>", ""],
    ["nested dynamic insertion", "<div>{row.title}</div>", ""],
    ["dynamic calls", "<div data-id={String(row.id)}/>", ""],
    ["foreign reactive subjects", "<div data-id={outer.id}/>", "const outer = { id: 'outer' }"],
    ["extra row statements", "{ const value = 1; return <div title={value}/> }", ""],
  ])("does not mark %s for patch mode", (name, row, extra) => {
    const plugin = solidUniversal()
    const transform = plugin.transform
    if (typeof transform !== "function") {
      throw new Error("solidUniversal must provide a transform hook")
    }
    const props =
      name === "explicit key functions"
        ? " keyed={row => row.id}"
        : name === "index accessors"
          ? ""
          : name === "fallback rows"
            ? " fallback={<div>none</div>}"
            : ""
    const params = name === "index accessors" ? "(row, index)" : "row"
    const output = transform.call(
      {} as never,
      `
        import { For } from "solid-js"
        ${extra}
        function App(props) {
          return <For each={props.items}${props}>{${params} => ${row}}</For>
        }
      `,
      "/fixture.tsx",
    )
    const code = typeof output === "string" ? output : output?.code
    expect(code, name).not.toMatch(/rowProof/)
    expect(code, name).not.toMatch(/patchDriver/)
  })
})
