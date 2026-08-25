import { defineConfig } from "vite"
import { dirname } from "node:path"
import { createRequire } from "node:module"
import { solidUniversal as solidUniversal } from "../../packages/solid/scripts/solid-universal-plugin"

// Pin Solid to its client dev build (see packages/solid/scripts/solid-universal-plugin).
const req = createRequire(import.meta.url)
const distDir = (p: string): string => dirname(p)

export default defineConfig({
  plugins: [solidUniversal()],
  resolve: {
    alias: [
      // Keep @solo/* as plain package imports (single module instance);
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
      // @solo/solid — must be bundled so Solid's reactive core resolves
      // through the alias pinning above instead of Node's "node" condition
      // (which yields the non-reactive server build).
      external: [/^@solo\/native$/],
    },
  },
})
