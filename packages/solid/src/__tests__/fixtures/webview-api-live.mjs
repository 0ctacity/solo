// Run outside Vitest so the native macOS event pump can own the main thread.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { setTimeout as delay } from "node:timers/promises"

const require = createRequire(import.meta.url)
const { SoloRenderer } = require("@solo/native")
const events = []
const renderer = new SoloRenderer((error, event) => {
  if (error) throw error
  events.push(event)
})
renderer.init({ title: "Solo WebView API regression", width: 420, height: 320 })
renderer.createElement(1, "div")
renderer.setStyle(1, JSON.stringify({ width: 420, height: 320 }))
renderer.createElement(2, "webview")
renderer.setStyle(2, JSON.stringify({ width: 400, height: 280 }))
renderer.setCustomProp(
  2,
  "html",
  JSON.stringify(`<!doctype html><title>Generated</title>
    <a id="next" href="chapter/2.html">Next</a>
    <a id="hash" href="#section">Section</a>
    <a id="popup" href="popup.html" target="_blank">Popup</a>`)
)
renderer.setCustomProp(2, "baseUrl", JSON.stringify("https://newsprint.example/articles/1/"))
renderer.setEventListener(2, "navigationRequest", true)
renderer.appendChild(1, 2)
renderer.setRoot(1)
renderer.commitMutations()

async function awaitWebKit(promise, label) {
  let settled = false
  promise.finally(() => { settled = true }).catch(() => {})
  for (let attempt = 0; !settled && attempt < 1_000; attempt += 1) {
    renderer.tick()
    await delay(5)
  }
  assert.ok(settled, `${label} did not settle`)
  return promise
}

async function awaitNavigationRequest(predicate, label) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    renderer.tick()
    const matchIndex = events.findIndex(
      (event) => event.eventType === "navigationRequest" && predicate(event)
    )
    if (matchIndex >= 0) return events.splice(matchIndex, 1)[0]
    await delay(5)
  }
  assert.fail(`${label} was not emitted`)
}

await awaitWebKit(renderer.waitWebviewReady(2), "generated HTML readiness")

const structured = JSON.parse(await awaitWebKit(
  renderer.evaluateWebviewJavaScript(2, `Promise.resolve({
    title: document.title,
    href: document.querySelector("#next")?.href,
    values: [1, true, null],
  })`),
  "structured evaluation"
))
assert.deepEqual(structured, {
  title: "Generated",
  href: "https://newsprint.example/articles/1/chapter/2.html",
  values: [1, true, null],
})
assert.equal(
  await awaitWebKit(renderer.evaluateWebviewJavaScript(2, "undefined"), "undefined evaluation"),
  "null"
)
await assert.rejects(
  awaitWebKit(renderer.evaluateWebviewJavaScript(2, "missingSoloValue"), "exception evaluation"),
  /JavaScript (exception|failed)/i
)
await assert.rejects(
  awaitWebKit(renderer.evaluateWebviewJavaScript(2, "(() => {})"), "unsupported evaluation"),
  /JavaScript (exception|failed)/i
)

await awaitWebKit(
  renderer.evaluateWebviewJavaScript(2, "(() => { document.querySelector('#next').click(); return null })()"),
  "intercepted link click"
)
const intercepted = await awaitNavigationRequest(
  (event) => !event.isSameDocument && !event.isNewWindow,
  "link navigation request"
)
assert.equal(intercepted.navigationUrl, "https://newsprint.example/articles/1/chapter/2.html")
renderer.cancelWebviewNavigation(2, intercepted.navigationId)
assert.equal(
  JSON.parse(await awaitWebKit(renderer.evaluateWebviewJavaScript(2, "location.href"), "location after cancellation")),
  "https://newsprint.example/articles/1/"
)

await awaitWebKit(
  renderer.evaluateWebviewJavaScript(2, "(() => { document.querySelector('#hash').click(); return null })()"),
  "same-document click"
)
const sameDocument = await awaitNavigationRequest(
  (event) => event.isSameDocument,
  "same-document navigation request"
)
assert.ok(sameDocument.navigationUrl.startsWith("https://newsprint.example/articles/1/"))
assert.throws(
  () => renderer.cancelWebviewNavigation(2, sameDocument.navigationId),
  /no longer pending/i
)
for (let attempt = 0; attempt < 20; attempt += 1) {
  renderer.tick()
  await delay(5)
}
assert.equal(
  JSON.parse(await awaitWebKit(renderer.evaluateWebviewJavaScript(2, "location.hash"), "same-document location")),
  "#section"
)

await awaitWebKit(
  renderer.evaluateWebviewJavaScript(2, "(() => { document.querySelector('#popup').click(); return null })()"),
  "new-window click"
)
const newWindow = await awaitNavigationRequest(
  (event) => event.isNewWindow,
  "new-window navigation request"
)
assert.equal(newWindow.navigationUrl, "https://newsprint.example/articles/1/popup.html")
assert.throws(
  () => renderer.allowWebviewNavigation(2, newWindow.navigationId),
  /no longer pending/i
)

const stale = renderer.evaluateWebviewJavaScript(2, "new Promise(() => {})")
renderer.setCustomProp(2, "html", JSON.stringify("<!doctype html><title>Replacement</title>"))
renderer.commitMutations()
renderer.tick()
await assert.rejects(awaitWebKit(stale, "stale evaluation"), /document changed/i)
await awaitWebKit(renderer.waitWebviewReady(2), "replacement readiness")

const destroyed = renderer.evaluateWebviewJavaScript(2, "new Promise(() => {})")
renderer.removeChild(1, 2)
renderer.destroyElement(2)
renderer.commitMutations()
renderer.tick()
await assert.rejects(awaitWebKit(destroyed, "destroyed evaluation"), /document changed|destroyed/i)
assert.throws(() => renderer.evaluateWebviewJavaScript(2, "1"), /not mounted/i)

console.log("webview-api:passed")
process.exit(0)
