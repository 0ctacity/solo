import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const executable = process.env.SOLO_CONTEXT_MENU_HOST ?? fileURLToPath(new URL(
  `../../../native/solo-context-menu.darwin-${process.arch}`, import.meta.url,
))

describe.skipIf(process.platform !== "darwin")("native menu tracking", () => {
  it("uses AppKit keyboard navigation, skipping disabled items and separators", async () => {
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] })
    let output = "", errors = ""
    child.stdout.on("data", (chunk) => { output += chunk })
    child.stderr.on("data", (chunk) => { errors += chunk })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject); child.once("exit", resolve)
    })
    void exited.catch(() => {})
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 8000)
    try {
      child.stdin.write(JSON.stringify({ x: 300, y: 400, items: [
        { id: "disabled", label: "Unavailable", disabled: true },
        { type: "separator" }, { id: "read", label: "Mark read", checked: true },
      ] }) + "\n")
      await expect.poll(() => output, { timeout: 5000 }).toContain('"ready":true')
      child.stdin.write('{"key":"down"}\n{"key":"enter"}\n')
      expect(await exited, errors).toBe(0)
      expect(output.trim().split("\n").at(-1)).toBe('"read"')
    } finally { clearTimeout(watchdog); child.kill("SIGKILL") }
  }, 10_000)

  it("keeps the application event loop running and cancels when its owner disconnects", async () => {
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] })
    let output = "", errors = "", ticks = 0
    child.stdout.on("data", (chunk) => { output += chunk })
    child.stderr.on("data", (chunk) => { errors += chunk })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject)
      child.once("exit", resolve)
    })
    // Mark rejection handled even if startup fails before the assertions.
    void exited.catch(() => {})
    const timer = setInterval(() => { ticks++ }, 20)
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 8000)
    try {
      child.stdin.write(JSON.stringify({ x: 300, y: 400, items: [
        { id: "read", label: "Mark read", checked: true },
        { type: "separator" },
        { id: "delete", label: "Delete", disabled: true },
      ] }) + "\n")
      await expect.poll(() => output, { timeout: 5000 }).toContain('"ready":true')
      const before = ticks
      await expect.poll(() => ticks).toBeGreaterThan(before + 5)
      expect(child.exitCode).toBeNull()
      child.stdin.end()
      expect(await exited, errors).toBe(0)
      expect(output.trim().split("\n").at(-1)).toBe("null")
    } finally {
      clearInterval(timer)
      clearTimeout(watchdog)
      child.kill("SIGKILL")
    }
  }, 10_000)
})
