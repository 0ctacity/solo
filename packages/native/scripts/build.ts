// Build the N-API library and its macOS menu companion with the same target.
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { chmodSync, copyFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
function run(command: string, arguments_: string[], env = process.env): void {
  const result = spawnSync(command, arguments_, { cwd: root, env, stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const require = createRequire(import.meta.url)
const cliPackage = require("@napi-rs/cli/package.json") as { bin: { napi: string } }
const cli = resolve(dirname(require.resolve("@napi-rs/cli/package.json")), cliPackage.bin.napi)
run(process.execPath, [cli, "build", "--platform", ...args])
const targetIndex = args.indexOf("--target")
const target = targetIndex < 0 ? undefined : args[targetIndex + 1]
if (targetIndex >= 0 && !target) throw new Error("--target requires a Rust target")
if (target ? target.endsWith("-apple-darwin") : process.platform === "darwin") {
  const targetDir = resolve(root, process.env.CARGO_TARGET_DIR ?? "target")
  const release = args.includes("--release")
  run("cargo", ["build", "--locked", "--manifest-path", "context-menu-host/Cargo.toml",
    ...(release ? ["--release"] : []), ...(target ? ["--target", target] : [])],
    { ...process.env, CARGO_TARGET_DIR: targetDir })
  const arch = target ? (target.startsWith("aarch64-") ? "arm64" : "x64") : process.arch
  const output = join(root, `solo-context-menu.darwin-${arch}`)
  copyFileSync(join(targetDir, ...(target ? [target] : []), release ? "release" : "debug", "solo-context-menu"), output)
  chmodSync(output, 0o755)
}
