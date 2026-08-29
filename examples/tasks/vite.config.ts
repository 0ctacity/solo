import { defineConfig } from "vite"
import { solidUniversal } from "@solo/solid/vite"

export default defineConfig({
  plugins: [solidUniversal()],
  build: {
    ssr: "index.tsx",
    outDir: "dist",
    target: "node20",
  },
})
