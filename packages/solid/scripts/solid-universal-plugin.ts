import { transformSync } from "@babel/core"
import type { Plugin } from "vite"
import { createRequire } from "node:module"
import { dirname } from "node:path"

// solid-js's exports map matches the "node" condition before
// "development", so native resolution yields the SSR server build, where
// reactive computations never re-run. Pin every Solid package to its client
// dev build explicitly.
//
// @solidjs/signals is a transitive dep that may not be requirable from the
// consuming package under bun's isolated node_modules layout, so resolve it
// from within solid-js itself.
const req = createRequire(import.meta.url)
const solidJsDist = dirname(req.resolve("solid-js"))
const signalsDist = dirname(createRequire(req.resolve("solid-js")).resolve("@solidjs/signals"))
const universalDist = dirname(req.resolve("@solidjs/universal"))

const PINNED: Record<string, string> = {
  "solid-js": `${solidJsDist}/dev.js`,
  "@solidjs/signals": `${signalsDist}/dev.js`,
  "@solidjs/universal": `${universalDist}/dev.js`,
}

export function solidUniversal(): Plugin {  return {
    name: "gpuix:solid-universal",
    enforce: "pre",
    async resolveId(id) {
      return PINNED[id] ?? null
    },
    transform(code, id) {
      const [path] = id.split("?")
      if (!/\.[jt]sx$/.test(path) || path.includes("node_modules")) return
      const parserPlugins = ["jsx"]
      if (/\.tsx$/.test(path)) parserPlugins.push("typescript")
      const out = transformSync(code, {
        filename: path,
        parserOpts: { plugins: parserPlugins },
        presets: [
          [
            "babel-preset-solid",
            // The compiler emits calls against this module; it re-exports the
            // createRenderer ops plus Solid control flow.
            { generate: "universal", moduleName: "@solo/solid/runtime" },
          ],
        ],
        sourceMaps: true,
      })
      if (out.code == null) return null
      return { code: out.code, map: out.map }
    },
  }
}
