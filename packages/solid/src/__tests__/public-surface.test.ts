import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as automation from "../automation.js"
import { solidUniversal } from "../vite.js"

type PackageManifest = {
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  exports?: Record<string, unknown>
}

function readPackage(relativePath: string): PackageManifest {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
  ) as PackageManifest
}

describe("Solid public package boundary", () => {
  it("exposes automation through @solo/solid", () => {
    expect(automation.connectStdio).toBeTypeOf("function")
    expect(automation.launch).toBeTypeOf("function")
  })

  it("publishes dedicated testing, automation, and Vite entrypoints", () => {
    const manifest = readPackage("../../package.json")

    expect(manifest.exports).toHaveProperty("./testing")
    expect(manifest.exports).toHaveProperty("./automation")
    expect(manifest.exports).toHaveProperty("./vite")
    expect(solidUniversal()).toMatchObject({ name: "solo:solid-universal" })
  })

  it("keeps bundled native imports behind the Solid package", async () => {
    const plugin = solidUniversal()
    const config = plugin.config
    if (typeof config !== "function") {
      throw new Error("solidUniversal must provide a config hook")
    }
    config.call({} as never, {}, { command: "build", mode: "production" })

    const resolveId = plugin.resolveId
    if (typeof resolveId !== "function") {
      throw new Error("solidUniversal must provide a resolveId hook")
    }

    await expect(
      resolveId.call({} as never, "@solo/native", undefined, {} as never),
    ).resolves.toEqual({
      id: "@solo/solid/_native",
      external: true,
    })
  })

  it("keeps the implementation packages behind @solo/solid", () => {
    const solid = readPackage("../../package.json")
    const core = readPackage("../../../core/package.json")
    const tasks = readPackage("../../../../examples/tasks/package.json")
    const counter = readPackage(
      "../../../../examples/solid-counter/package.json",
    )

    expect(core.private).toBe(true)
    expect(solid.dependencies).toMatchObject({
      "@solo/core": expect.any(String),
      "@solo/native": expect.any(String),
    })
    expect(solid.peerDependencies ?? {}).not.toHaveProperty("@solo/native")

    for (const example of [tasks, counter]) {
      expect(example.dependencies).toHaveProperty("@solo/solid")
      expect(example.dependencies).not.toHaveProperty("@solo/core")
      expect(example.dependencies).not.toHaveProperty("@solo/native")
      expect(example.dependencies).not.toHaveProperty("@solidjs/universal")
    }
  })
})
