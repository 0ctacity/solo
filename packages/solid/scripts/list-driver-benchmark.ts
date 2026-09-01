import { MockNativeRenderer } from "@solo/core"
import { createRoot, createStore, mapArray } from "solid-js"
import {
  createElement,
  flushMutations,
  insert,
  patchDriver,
  rowProof,
  setProp,
  setSoloRenderer,
  universal,
  type SoloSolidNode,
} from "../src/runtime.js"

interface Row {
  id: number
}

interface PatchAccessor extends Function {
  $ll: {
    each: () => Row[]
    row: (row: Row) => SoloSolidNode
  }
}

const ROWS = 1_000
const WARMUP = 20
const UPDATES = 100
const TRIALS = 7

function buildRow(row: Row, patch: boolean): SoloSolidNode {
  const node = createElement("div")
  if (patch) {
    patchDriver(row, (next, previous, force) => {
      if (force || next.id !== previous?.id) setProp(node, "testId", next.id, previous?.id)
    })
  } else {
    universal.effect(
      () => row.id,
      (value, previous) => {
        setProp(node, "testId", value, previous)
      },
    )
  }
  return node
}

function trial(mode: "classic" | "patch"): { milliseconds: number; nativeOps: number } {
  const renderer = new MockNativeRenderer()
  setSoloRenderer(renderer)
  let rotate: (() => void) | undefined
  let dispose: (() => void) | undefined

  createRoot((rootDispose) => {
    dispose = rootDispose
    const [rows, setRows] = createStore<Row[]>(
      Array.from({ length: ROWS }, (_, id) => ({ id })),
    )
    rotate = () =>
      setRows((draft) => {
        const first = draft.shift()
        if (first) draft.push(first)
      })
    const parent = createElement("div")
    if (mode === "patch") {
      const accessor = (() => {
        throw new Error("patch benchmark unexpectedly entered classic reconciliation")
      }) as PatchAccessor
      accessor.$ll = { each: () => rows, row: rowProof((row) => buildRow(row, true)) }
      insert(parent, accessor)
    } else {
      universal.insert(parent, mapArray(() => rows, (row) => buildRow(row, false)))
    }
  })
  flushMutations()
  renderer.drainOps()

  for (let index = 0; index < WARMUP; index++) {
    rotate!()
    flushMutations()
    renderer.drainOps()
  }

  let nativeOps = 0
  const start = performance.now()
  for (let index = 0; index < UPDATES; index++) {
    rotate!()
    flushMutations()
    nativeOps += renderer.drainOps().filter(([name]) => name !== "commitMutations").length
  }
  const milliseconds = performance.now() - start
  dispose!()
  flushMutations()
  return { milliseconds, nativeOps }
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]!
}

const classic = Array.from({ length: TRIALS }, () => trial("classic"))
const patch = Array.from({ length: TRIALS }, () => trial("patch"))
const classicMedian = median(classic.map((result) => result.milliseconds))
const patchMedian = median(patch.map((result) => result.milliseconds))

console.log(
  JSON.stringify(
    {
      rows: ROWS,
      updates: UPDATES,
      trials: TRIALS,
      classic: {
        medianMs: Number(classicMedian.toFixed(2)),
        nativeOpsPerUpdate: classic[0]!.nativeOps / UPDATES,
      },
      patch: {
        medianMs: Number(patchMedian.toFixed(2)),
        nativeOpsPerUpdate: patch[0]!.nativeOps / UPDATES,
      },
      measuredSpeedup: Number((classicMedian / patchMedian).toFixed(2)),
    },
    null,
    2,
  ),
)
