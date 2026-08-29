import { transformSync } from "@babel/core"
import type { ParserPlugin } from "@babel/parser"
import { createRequire } from "node:module"
import { dirname } from "node:path"
import type { Plugin } from "vite"

// Solid's package exports select the server build under Node. Native Solo apps
// need the reactive client builds even though Vite produces an SSR bundle.
const req = createRequire(import.meta.url)
const solidJsDist = dirname(req.resolve("solid-js"))
const signalsDist = dirname(
  createRequire(req.resolve("solid-js")).resolve("@solidjs/signals"),
)
const universalDist = dirname(req.resolve("@solidjs/universal"))

const PINNED: Record<string, string> = {
  "solid-js": `${solidJsDist}/dev.js`,
  "@solidjs/signals": `${signalsDist}/dev.js`,
  "@solidjs/universal": `${universalDist}/dev.js`,
}

/** Compile Solid JSX for Solo and keep native implementation details external. */
export function solidUniversal(): Plugin {
  return {
    name: "solo:solid-universal",
    enforce: "pre",
    config() {
      return {
        build: {
          rollupOptions: {
            external: [/^@solo\/native$/],
          },
        },
      }
    },
    async resolveId(id) {
      return PINNED[id] ?? null
    },
    transform(code, id) {
      const [path] = id.split("?")
      if (!/\.[jt]sx$/.test(path) || path.includes("node_modules")) return

      const parserPlugins: ParserPlugin[] = ["jsx"]
      if (/\.tsx$/.test(path)) parserPlugins.push("typescript")
      const out = transformSync(code, {
        filename: path,
        parserOpts: { plugins: parserPlugins },
        presets: [
          [
            "babel-preset-solid",
            { generate: "universal", moduleName: "@solo/solid/runtime" },
          ],
        ],
        sourceMaps: true,
      })
      if (out == null || out.code == null) return null
      return { code: out.code, map: out.map }
    },
  }
}
