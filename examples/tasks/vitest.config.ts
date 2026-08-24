import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["automation.test.ts"],
    // Spawns the real app; each test must run alone.
    pool: "forks",
    testTimeout: 30_000,
  },
})
