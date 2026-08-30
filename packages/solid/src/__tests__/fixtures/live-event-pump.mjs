// Run outside Vitest: a blocked native tick must not block its watchdog.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { setTimeout as delay } from "node:timers/promises"

const require = createRequire(import.meta.url)
const { SoloRenderer } = require("@solo/native")
const renderer = new SoloRenderer()
renderer.init({ title: "Solo event-pump regression", width: 320, height: 240 })
renderer.createElement(1, "div")
renderer.createElement(2, "text")
renderer.appendChild(1, 2)
renderer.setRoot(1)

for (let count = 0; count < 100; count++) {
  if (process.argv.includes("--webview") && count % 10 === 0) {
    if (count > 0) {
      renderer.removeChild(1, count + 90)
      renderer.destroyElement(count + 90)
    }
    renderer.createElement(count + 100, "webview")
    renderer.setStyle(count + 100, JSON.stringify({ width: 200, height: 100 }))
    renderer.setCustomProp(count + 100, "html", JSON.stringify("<p>Local preview</p>"))
    renderer.appendChild(1, count + 100)
  }
  renderer.setText(2, `Count: ${count}`)
  renderer.commitMutations()
  // Exercise both a paced JS loop and requests after native work goes idle.
  await delay(count % 10 === 0 ? 100 : 8)
  assert.equal(renderer.tick(), true)
  renderer.simulateClick(20, 20, 0)
  process.stdout.write(`tick:${count}\n`)
}

// Read-only requests must still progress after the last invalidated frame.
for (let idle = 0; idle < 200; idle++) {
  await delay(8)
  assert.equal(renderer.tick(), true)
  renderer.getAutomationTree()
  process.stdout.write(`idle:${idle}\n`)
}

for (let frame = 0; frame < 20; frame++) {
  await delay(8)
  renderer.tick()
  if (renderer.getPaintedText().includes("Count: 99")) break
}
assert.ok(renderer.getPaintedText().includes("Count: 99"), "latest JS update must paint")
console.log("event-pump:passed")
process.exit(0)
