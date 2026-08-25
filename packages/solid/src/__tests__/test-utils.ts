/// Shared test utilities for @solo/solid suites.
/// Ported from packages/react/src/__tests__/test-utils.ts.

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { expect } from "vitest"

export const isCI = !!process.env.CI

/** Where visual tests write their PNGs. Kept in the repo (gitignored) rather
 *  than /tmp so the output can actually be looked at after a run. */
export const SHOTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../screenshots"
)

/** Compute byte-level similarity between two buffers (0..1).
 *  For PNGs from the same renderer, identical pixels → identical bytes. */
export function bufferSimilarity(a: Buffer, b: Buffer): number {
  const len = Math.max(a.length, b.length)
  if (len === 0) return 1
  let matching = 0
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) matching++
  }
  return matching / len
}

/** Assert two screenshot PNGs exist, are non-empty, and are visually
 *  different (less than 99% byte similarity).
 *  Skipped on CI — Metal on macOS VMs doesn't repaint between captures. */
export function expectScreenshotsDiffer(beforePath: string, afterPath: string) {
  expect(fs.existsSync(beforePath)).toBe(true)
  expect(fs.existsSync(afterPath)).toBe(true)
  expect(fs.statSync(beforePath).size).toBeGreaterThan(0)

  if (isCI) return

  const before = fs.readFileSync(beforePath)
  const after = fs.readFileSync(afterPath)
  const similarity = bufferSimilarity(before, after)
  expect(similarity).toBeLessThan(0.99)
}
