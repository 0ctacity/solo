import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

const run = promisify(execFile)
const fixture = fileURLToPath(new URL("./fixtures/live-event-pump.mjs", import.meta.url))

describe.skipIf(process.platform !== "darwin")("live macOS event pump", () => {
  it.each(["native", "webview"])("returns after idle/input and paints updates (%s)", async (mode) => {
    const args = mode === "webview" ? ["--webview"] : []
    const { stdout } = await run(process.execPath, [fixture, ...args], {
      timeout: 15_000,
      killSignal: "SIGKILL",
    }).catch((error) => {
      throw new Error(`Event-pump child failed; last progress:\n${error.stdout?.slice(-1000)}`, {
        cause: error,
      })
    })
    expect(stdout).toContain("event-pump:passed")
  }, 20_000)
})
