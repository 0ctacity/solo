import { execFile, spawn } from "node:child_process"
import { mkdirSync, readdirSync, rmSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"
import { connectStdio } from "../automation.js"
import type { TreeNode } from "../automation.js"

describe.skipIf(process.platform !== "darwin")("packaged native menus", () => {
  it("keeps JS responsive, selects with native keys, cancels unmounts, and closes cleanly", async () => {
    const packager = fileURLToPath(new URL("./fixtures/package-commands.ts", import.meta.url))
    const { stdout } = await promisify(execFile)("bun", [packager, "context-menus"], { timeout: 30_000 })
    const executable = stdout.match(/^commands-executable:(.+)$/m)?.[1]
    if (!executable) throw new Error("Packager did not return an executable")
    const output = dirname(dirname(dirname(dirname(executable))))
    const runtimeTmp = join(output, "runtime-tmp")
    mkdirSync(runtimeTmp)
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, TMPDIR: runtimeTmp } })
    let errors = ""
    child.stderr.on("data", (data) => { errors += data })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject); child.once("exit", resolve)
    })
    void exited.catch(() => {})
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 20_000)
    try {
      const app = await connectStdio({
        write: (chunk) => { child.stdin.write(chunk) },
        feed: (listener) => { child.stdout.on("data", (chunk) => listener(String(chunk))) },
        close: async () => { child.kill() },
      })
      const flatten = (node: TreeNode): string => (node.text ?? "") + (node.children ?? []).map(flatten).join("")
      const text = async (id: string) => flatten(await app.getByTestId(id).element())
      const ticks = async () => Number((await text("ticks")).split(": ")[1])
      await expect.poll(async () => (await app.getByTestId("owner").bounds()).height).toBeGreaterThan(0)
      for (let cycle = 0; cycle < 2; cycle++) {
        await app.getByTestId("owner").click()
        await expect.poll(() => text("status")).toBe("Menu pending")
        const before = await ticks()
        await expect.poll(ticks).toBeGreaterThan(before + 10)
        expect(await text("status"), "menu must remain open before keyboard input").toBe("Menu pending")
        await app.getByTestId("owner").press("down enter")
        await expect.poll(() => text("status")).toBe("read")
        expect(readdirSync(runtimeTmp).filter((name) => name.startsWith("solo-context-menu-"))).toEqual([])
      }
      await app.getByTestId("owner").click()
      await expect.poll(() => text("status")).toBe("Menu pending")
      await app.getByTestId("owner").press("escape")
      await expect.poll(() => text("status")).toBe("Cancelled")
      await app.getByTestId("owner").click()
      await expect.poll(() => text("status")).toBe("Menu pending")
      const beforeUnmount = await ticks()
      await expect.poll(ticks).toBeGreaterThan(beforeUnmount + 10)
      await app.getByTestId("remove").click()
      await expect.poll(() => text("status")).toBe("Cancelled")
      await app.getByTestId("restore").click()
      await app.getByTestId("owner").click()
      await expect.poll(() => text("status")).toBe("Menu pending")
      await app.getByTestId("close").click()
      expect(await exited, errors).toBe(0)
      await expect.poll(() => readdirSync(runtimeTmp).filter((name) => name.startsWith("solo-context-menu-"))).toEqual([])
    } catch (error) {
      throw new Error(`Packaged context menu failed:\n${errors}`, { cause: error })
    } finally {
      clearTimeout(watchdog)
      child.kill("SIGKILL")
      await exited.catch(() => {})
      if (basename(output).startsWith("solo-commands-")) rmSync(output, { recursive: true, force: true })
    }
  }, 60_000)
})
