import { defineConfig } from "vite"
import { dirname } from "node:path"
import { createRequire } from "node:module"
import { gpuixSolidUniversal as solidUniversal } from "../../packages/solid/scripts/gpuix-solid-plugin"

// Pin Solid to its client dev build (see packages/solid/scripts/gpuix-solid-plugin).
const req = createRequire(import.meta.url)
const distDir = (p: string): string => dirname(p)

export default defineConfig({
  plugins: [solidUniversal()],
  resolve: {
    alias: [
      // Keep @gpuix/* as plain package imports (single module instance);
      // only pin Solid's reactive core to its client build.
      { find: /^solid-js$/, replacement: `${distDir(req.resolve("solid-js"))}/dev.js` },
      {
        find: /^@solidjs\/signals$/,
        replacement: `${distDir(
          createRequire(req.resolve("solid-js")).resolve("@solidjs/signals")
        )}/dev.js`,
      },
      {
        find: /^@solidjs\/universal$/,
        replacement: `${distDir(req.resolve("@solidjs/universal"))}/dev.js`,
      },
    ],
  },
  build: {
    ssr: "index.tsx",
    outDir: "dist",
    target: "node20",
    rollupOptions: {
      // Only the native addon cannot be bundled. Everything else — including
      // @gpuix/solid — must be bundled so Solid's reactive core resolves
      // through the alias pinning above instead of Node's "node" condition
      // (which yields the non-reactive server build).
      external: [/^@gpuix\/native$/],
    },
  },
})
