/// Diagnostic driver for the Linux physical-scroll investigation.
///
/// Launches the tasks app with GPUIX_SCROLL_TRACE=1, injects wheel events at
/// the GPUI event boundary (simulate_scroll_wheel), and reports where the
/// event surfaces. Run from examples/tasks on the affected machine:
///
///   bun run diagnose
///
/// Interpretation:
///   - injected wheel scrolls fine, physical wheel dead
///       -> loss is upstream of GPUI (OS -> gpui_linux platform client);
///          compare [scroll-trace] output between injected and physical.
///   - [scroll-trace] lines appear but offset never changes
///       -> loss is hit-test gating or scroll-handle wiring in GPUIX.

import { spawn } from "node:child_process"
import { connectStdio } from "@gpuix/core/automation"

const ENTRY = new URL("./dist/index.js", import.meta.url).pathname

const child = spawn(process.execPath, [ENTRY], {
  cwd: new URL(".", import.meta.url).pathname,
  env: { ...process.env, GPUIX_SCROLL_TRACE: "1" },
  stdio: ["pipe", "pipe", "pipe"],
})
child.stderr.on("data", (b: Buffer) => process.stderr.write(`[app] ${b}`))

let sawPositiveScrollMax = false
let sawAppliedDelta = false
child.stderr.on("data", (b: Buffer) => {
  const line = b.toString()
  if (line.includes("scroll_max=(") && !line.includes("scroll_max=(0.00,0.00)")) sawPositiveScrollMax = true
  if (line.includes("applied dy=")) sawAppliedDelta = true
  process.stderr.write(`[app] ${line}`)
})

const app = await connectStdio({
  write: (chunk) => child.stdin.write(chunk),
  feed: (listener) => {
    child.stdout.on("data", (buf: Buffer) => listener(buf.toString("utf8")))
  },
  close: async () => {
    child.kill()
  },
})

let painted = false
for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 200))
  const { text } = await app.call("getPaintedText", {})
  if (text.length > 0) {
    painted = true
    console.log(`paint detected after ${(i + 1) * 200}ms (${text.length} strings)`)
    break
  }
}
if (!painted) {
  console.log("NO PAINT within 10s — no drawing surface here; results inconclusive.")
}

const list = await app.getByTestId("task-list").element()
console.log("list element id:", list.id)

const before = await app.call("getScrollOffset", { elementId: list.id })
console.log("offset before:", JSON.stringify(before.offset))

console.log("injecting wheel: deltaY=-240 at (240,320)…")
await app.call("scrollWheel", { x: 240, y: 320, deltaX: 0, deltaY: -240 })

for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 150))
  const after = await app.call("getScrollOffset", { elementId: list.id })
  console.log(`offset t+${(i + 1) * 150}ms:`, JSON.stringify(after.offset))
}

if (!painted) {
  console.log("inconclusive: no paint")
} else if (sawPositiveScrollMax && sawAppliedDelta && before.offset![1]! < 0) {
  console.log("VERDICT: scrolling pipeline healthy (scroll_max > 0, deltas applied and retained).")
} else {
  console.log(`VERDICT: still broken — scrollMax>0=${sawPositiveScrollMax}, applied=${sawAppliedDelta}, offsetNow=${JSON.stringify(before.offset)}`)
}

console.log("\n>>> Now scroll PHYSICALLY over the task list. [scroll-trace] lines")
console.log(">>> below show whether GPUI receives your physical wheel events.")
setInterval(() => {}, 1 << 30)
