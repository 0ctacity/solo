/// Test helpers for the Solid package.
///
/// The GPU-backed TestSoloRenderer is macOS-only, so tests run against
/// MockNativeRenderer from @solo/core. It records every mutation op, which
/// lets us assert the exact protocol traffic (e.g. that a signal-driven text
/// change produces one setText op and no tree rebuild).

import { handleSoloEvent, MockNativeRenderer } from "@solo/core"
import type { EventPayload } from "@solo/native"
import type { MockElement, MockNativeRenderer as MockNativeRendererType } from "@solo/core"
import { render } from "./index.js"

export interface SolidTestRoot {
  renderer: MockNativeRendererType
  unmount: () => void
}

/** Mount a Solid app against an in-memory MockNativeRenderer. */
export function mountTest(
  code: () => unknown,
  renderer: MockNativeRendererType = new MockNativeRenderer()
): SolidTestRoot {
  const root: { unmount(): void } | null = render(
    code as () => never,
    // The mock is not a SoloRenderer, so no window and no frame loop.
    { renderer: renderer as never }
  )
  return {
    renderer,
    unmount: () => root?.unmount(),
  }
}

/** Find an element by its `testId` custom prop. */
export function findByTestId(
  renderer: MockNativeRendererType,
  testId: string
): MockElement | undefined {
  return [...renderer.elements.values()].find((el) => el.customProps.testId === testId)
}

/** The concatenated text content of an element's inner text nodes. */
export function textOf(renderer: MockNativeRendererType, el: MockElement): string {
  return el.children
    .map((id) => renderer.getElement(id))
    .filter((c) => c != null && c.type === "text")
    .map((c) => (c as MockElement).text ?? "")
    .join("")
}

/** Fire a native-style event at the element with the given testId. */
export function fireEvent(
  renderer: MockNativeRendererType,
  testId: string,
  eventType: string
): void {
  const el = findByTestId(renderer, testId)
  if (!el) throw new Error(`No element with testId "${testId}"`)
  handleSoloEvent({
    elementId: el.id,
    eventType,
  } as EventPayload)
}
