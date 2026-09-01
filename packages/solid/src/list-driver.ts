import {
  createOwner,
  createRenderEffect,
  onCleanup,
  patchableRaw,
  registerPatch,
  registerRowOps,
  registerSlotPatch,
  runWithOwner,
  storeHasOptimisticFamily,
  storeIsShallow,
  untrack,
} from "solid-js"

const PURE_ROW = Symbol.for("solid.pure-row")

interface ListMetadata<Row, Node> {
  each: () => Row[]
  row: ((row: Row) => Node) & { [PURE_ROW]?: true }
  keyed?: boolean | ((row: Row) => unknown)
}

export interface PatchListAccessor<Row, Node> extends Function {
  $ll?: ListMetadata<Row, Node>
}

interface PatchListHost<Node> {
  build(build: () => Node): Node
  insert(parent: Node, node: Node, anchor?: Node): void
  remove(parent: Node, node: Node): void
  discard(node: Node): void
  parent(node: Node): Node | undefined
}

type PatchBody<Row> = (next: Row, previous: Row | undefined, force?: boolean) => void

interface RowCollector<Row> {
  row: Row | undefined
  bodies: PatchBody<Row>[]
  unbinds: (() => void)[]
}

let rowCollector: RowCollector<unknown> | null = null

export function rowProof<T extends Function>(fn: T): T {
  Object.defineProperty(fn, PURE_ROW, { value: true, configurable: true })
  return fn
}

function trackedEffect<T>(read: () => T, write: (value: T) => void): void {
  createRenderEffect(read, write, { sync: true, transparent: true })
}

export function patchDriver<Row>(subject: Row, body: PatchBody<Row>): void {
  const raw = patchableRaw(subject)
  if (raw !== undefined) {
    body(raw as Row, undefined, true)
    const unbind = registerPatch(subject, body)
    if (rowCollector !== null) rowCollector.unbinds.push(unbind)
    else onCleanup(unbind)
  } else if (rowCollector !== null && subject === rowCollector.row) {
    ;(rowCollector.bodies as PatchBody<Row>[]).push(body)
    body(subject, undefined, true)
  } else {
    trackedEffect(
      () => body(subject, subject, false),
      () => untrack(() => body(subject, undefined, true)),
    )
  }
}

function lisPositions(sources: number[]): Set<number> {
  const tails: number[] = []
  const tailsIndex: number[] = []
  const previous = new Array<number>(sources.length).fill(-1)
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index]!
    if (source === -1) continue
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (tails[middle]! < source) low = middle + 1
      else high = middle
    }
    if (low > 0) previous[index] = tailsIndex[low - 1]!
    tails[low] = source
    tailsIndex[low] = index
  }
  const stable = new Set<number>()
  let index = tailsIndex.length ? tailsIndex[tails.length - 1]! : -1
  while (index >= 0) {
    stable.add(index)
    index = previous[index]!
  }
  return stable
}

/**
 * RC.4's patch-mode list driver adapted from DOM nodes to Solo's retained
 * nodes. It returns false without touching the tree whenever the list cannot
 * use the upstream store patch protocol.
 */
export function driveList<Row, Node>(
  parent: Node,
  list: PatchListAccessor<Row, Node>,
  marker: Node | undefined,
  lateClassic: () => void,
  host: PatchListHost<Node>,
): boolean {
  const metadata = list.$ll
  if (!metadata || metadata.row[PURE_ROW] !== true) return false
  if (typeof metadata.keyed === "function") return false

  const evaluationOwner = createOwner({ id: "&each" })
  let subject = runWithOwner(evaluationOwner, () => untrack(metadata.each))
  evaluationOwner.dispose()
  let raw = subject != null ? patchableRaw(subject) : undefined
  if (raw === undefined || !Array.isArray(raw)) return false
  if (storeHasOptimisticFamily(subject)) raw = untrack(() => Array.from(subject))

  const row = metadata.row
  const shallow = storeIsShallow(subject)
  const listOwner = createOwner()
  let declined = false
  let lastBodies: PatchBody<Row>[] = []
  let lastUnbinds: (() => void)[] = []

  const collectRow = (absoluteIndex: number, build: () => Node): Node => {
    const previousCollector = rowCollector
    const collector: RowCollector<Row> = {
      row: shallow ? subject[absoluteIndex] : undefined,
      bodies: [],
      unbinds: [],
    }
    rowCollector = collector as RowCollector<unknown>
    try {
      return build()
    } finally {
      lastBodies = collector.bodies
      lastUnbinds = collector.unbinds
      rowCollector = previousCollector
    }
  }

  const bindRow = (absoluteIndex: number): Node =>
    host.build(() =>
      collectRow(absoluteIndex, () =>
        runWithOwner(listOwner, () => untrack(() => row(subject[absoluteIndex]!))),
      ),
    )

  let entries = new Array<Node>(raw.length)
  let rowBodies: PatchBody<Row>[][] | null = shallow ? new Array(raw.length) : null
  let rowUnbinds = new Array<(() => void)[]>(raw.length)
  let previousRows = (raw as Row[]).slice()

  const runUnbinds = (unbinds: (() => void)[] | undefined): void => {
    if (unbinds) for (const unbind of unbinds) unbind()
  }
  const unbindAllRows = (): void => {
    for (const unbinds of rowUnbinds) runUnbinds(unbinds)
    rowUnbinds = []
  }

  let builtCount = 0
  try {
    for (; builtCount < raw.length; builtCount++) {
      const node = bindRow(builtCount)
      entries[builtCount] = node
      if (rowBodies !== null) rowBodies[builtCount] = lastBodies
      rowUnbinds[builtCount] = lastUnbinds
      host.insert(parent, node, marker)
    }
  } catch (error) {
    runUnbinds(lastUnbinds)
    for (let index = 0; index < builtCount; index++) {
      runUnbinds(rowUnbinds[index])
      const node = entries[index]!
      if (host.parent(node) === parent) host.remove(parent, node)
      else host.discard(node)
    }
    listOwner.dispose()
    throw error
  }

  const identityOps = (nextRows: Row[]) => {
    const identity = (value: Row): unknown => {
      const valueRaw = value != null ? patchableRaw(value) : undefined
      return valueRaw !== undefined ? valueRaw : value
    }
    const oldIndices = new Map<unknown, number | number[]>()
    for (let index = 0; index < previousRows.length; index++) {
      const key = identity(previousRows[index]!)
      const existing = oldIndices.get(key)
      if (existing === undefined) oldIndices.set(key, index)
      else if (Array.isArray(existing)) existing.push(index)
      else oldIndices.set(key, [existing, index])
    }
    const sources = new Array<number>(nextRows.length)
    for (let index = 0; index < nextRows.length; index++) {
      const key = identity(nextRows[index]!)
      const match = oldIndices.get(key)
      if (match === undefined) sources[index] = -1
      else if (Array.isArray(match)) {
        sources[index] = match.shift()!
        if (match.length === 1) oldIndices.set(key, match[0]!)
      } else {
        sources[index] = match
        oldIndices.delete(key)
      }
    }
    return { prefix: 0, sources }
  }

  const rebuildReferences = shallow && typeof metadata.keyed !== "function"
  let resyncNeeded = false
  const applyOps = (next: Row[], supplied: { prefix: number; sources: number[] } | null): void => {
    if (declined) return
    let ops = resyncNeeded ? null : supplied
    if (ops === null) ops = identityOps(next)
    const { prefix, sources } = ops
    const built = new Array<Node | undefined>(sources.length)
    const builtBodies = rowBodies !== null ? new Array<PatchBody<Row>[]>(sources.length) : null
    const builtUnbinds = new Array<(() => void)[]>(sources.length)

    let builtThrough = 0
    try {
      for (; builtThrough < sources.length; builtThrough++) {
        const absoluteIndex = prefix + builtThrough
        const source = sources[builtThrough]!
        if (source === -1 || (rebuildReferences && next[absoluteIndex] !== previousRows[source])) {
          built[builtThrough] = bindRow(absoluteIndex)
          if (builtBodies !== null) builtBodies[builtThrough] = lastBodies
          builtUnbinds[builtThrough] = lastUnbinds
        }
      }
    } catch (error) {
      for (let index = 0; index < builtThrough; index++) {
        runUnbinds(builtUnbinds[index])
        if (built[index] !== undefined) host.discard(built[index]!)
      }
      runUnbinds(lastUnbinds)
      resyncNeeded = true
      throw error
    }

    const retained = new Set<number>()
    for (let index = 0; index < sources.length; index++) {
      if (sources[index]! >= 0 && built[index] === undefined) retained.add(sources[index]!)
    }
    for (let index = prefix; index < entries.length; index++) {
      if (!retained.has(index)) {
        host.remove(parent, entries[index]!)
        runUnbinds(rowUnbinds[index])
      }
    }

    const nextEntries = new Array<Node>(prefix + sources.length)
    const nextBodies = rowBodies !== null ? new Array<PatchBody<Row>[]>(prefix + sources.length) : null
    const nextUnbinds = new Array<(() => void)[]>(prefix + sources.length)
    for (let index = 0; index < prefix; index++) {
      nextEntries[index] = entries[index]!
      if (nextBodies !== null) nextBodies[index] = rowBodies![index]!
      nextUnbinds[index] = rowUnbinds[index]!
    }

    const stable = lisPositions(sources)
    let anchor = marker
    for (let index = sources.length - 1; index >= 0; index--) {
      const absoluteIndex = prefix + index
      const source = sources[index]!
      let node: Node
      if (built[index] !== undefined) {
        node = built[index]!
        if (nextBodies !== null) nextBodies[absoluteIndex] = builtBodies![index]!
        nextUnbinds[absoluteIndex] = builtUnbinds[index]!
        host.insert(parent, node, anchor)
      } else {
        node = entries[source]!
        if (nextBodies !== null) nextBodies[absoluteIndex] = rowBodies![source]!
        nextUnbinds[absoluteIndex] = rowUnbinds[source]!
        if (!stable.has(index)) host.insert(parent, node, anchor)
      }
      nextEntries[absoluteIndex] = node
      anchor = node
    }
    entries = nextEntries
    if (nextBodies !== null) rowBodies = nextBodies
    rowUnbinds = nextUnbinds
    previousRows = next.slice()
    resyncNeeded = false
  }

  let unbindRows = runWithOwner(listOwner, () => registerRowOps(subject, applyOps))
  const rebuildSlot = (index: number): void => {
    runUnbinds(rowUnbinds[index])
    const old = entries[index]!
    const node = bindRow(index)
    rowBodies![index] = lastBodies
    rowUnbinds[index] = lastUnbinds
    host.insert(parent, node, old)
    host.remove(parent, old)
    entries[index] = node
  }
  const applySlot = (index: number, next: Row, previous: Row): void => {
    if (declined) return
    if (resyncNeeded) {
      const live = subject != null ? patchableRaw(subject) : undefined
      if (live !== undefined && Array.isArray(live)) applyOps(live as Row[], null)
      return
    }
    if (rebuildReferences) rebuildSlot(index)
    else {
      const bodies = rowBodies?.[index]
      if (bodies) for (const body of bodies) body(next, previous, false)
    }
    previousRows[index] = next
  }
  let unbindSlots = shallow
    ? runWithOwner(listOwner, () => registerSlotPatch(subject, applySlot))
    : null

  runWithOwner(listOwner, () =>
    trackedEffect(metadata.each, (value) => {
      if (declined || value === subject) return
      const nextRaw = value != null ? patchableRaw(value) : undefined
      unbindRows()
      unbindSlots?.()
      if (
        nextRaw === undefined ||
        !Array.isArray(nextRaw) ||
        storeIsShallow(value) !== shallow
      ) {
        for (const node of entries) host.remove(parent, node)
        entries = []
        previousRows = []
        unbindAllRows()
        subject = value
        declined = true
        listOwner.dispose()
        lateClassic()
        return
      }
      const swapOps = identityOps(nextRaw as Row[])
      subject = value
      unbindRows = runWithOwner(listOwner, () => registerRowOps(subject, applyOps))
      if (shallow) {
        unbindSlots = runWithOwner(listOwner, () => registerSlotPatch(subject, applySlot))
      }
      applyOps(nextRaw as Row[], swapOps)
    }),
  )

  onCleanup(() => {
    unbindRows()
    unbindSlots?.()
    unbindAllRows()
    listOwner.dispose()
  })
  return true
}
