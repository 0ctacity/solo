import { defineConfig } from "vitest/config"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { gpuixSolidUniversal } from "./scripts/gpuix-solid-plugin.js"

const req = createRequire(import.meta.url)
// Resolve each package's dist directory, then point at the client dev
// build explicitly (avoids both the SSR builds and bun's isolated
// node_modules layout).
//
// @solidjs/signals is a transitive dep that may not be requirable from this
// package, so resolve it from within solid-js itself.
const solidJsEntry = req.resolve("solid-js")
const signalsReq = createRequire(solidJsEntry)
const distDir = (p: string): string => dirname(p)
console.log("[cfg] solid-js entry:", solidJsEntry)
console.log("[cfg] signals:", signalsReq.resolve("@solidjs/signals"))
console.log("[cfg] universal:", req.resolve("@solidjs/universal"))

export default defineConfig({
  plugins: [gpuixSolidUniversal()],
  resolve: {
    // Tests run against src, not dist.
    alias: [
      {
        find: /^@gpuix\/solid\/runtime$/,
        replacement: fileURLToPath(new URL("./src/runtime.ts", import.meta.url)),
      },
      {
        find: /^@gpuix\/solid$/,
        replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // The mock renderer needs no DOM environment.
    environment: "node",
    // Inline the Solid packages so gpuixSolidUniversal's resolveId pinning
    // also applies to their INTERNAL imports. Externalized, they would load
    // solid-js's server build natively and lose all reactivity.
    server: {
      deps: { inline: ["solid-js", "@solidjs/signals", "@solidjs/universal"] },
    },
  },
})
