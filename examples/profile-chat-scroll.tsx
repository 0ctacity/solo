// Profile ChatApp wheel frames. Run with bun --cpu-prof.
import React from 'react'
import { createTestRoot } from '@gpuix/react'
import { ChatApp } from './chat'

const root = createTestRoot()
const native = (root.renderer as { native: { simulateScrollWheel: (...args: number[]) => void } })
  .native

const mountStart = performance.now()
const count = Number(process.env.TURNS ?? 10_000)
const safe = process.env.SAFE_MDX === '1'
root.render(<ChatApp turnCount={count} includeSafeMdx={safe} />)
console.log(`mount ${(performance.now() - mountStart).toFixed(1)}ms`)

const samples: number[] = []
for (let i = 0; i < 40; i++) {
  native.simulateScrollWheel(700, 400, 0, i % 2 === 0 ? -160 : 160)
  const start = performance.now()
  root.renderer.flush()
  samples.push(performance.now() - start)
}
samples.sort((a, b) => a - b)
const mean = samples.reduce((a, b) => a + b, 0) / samples.length
console.log(
  `wheel flush n=${samples.length} mean=${mean.toFixed(2)}ms p50=${samples[20]!.toFixed(2)}ms p95=${samples[38]!.toFixed(2)}ms max=${samples[39]!.toFixed(2)}ms`,
)
