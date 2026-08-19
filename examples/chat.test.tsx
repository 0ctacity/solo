/**
 * Visual tests for the ChatGPT-style example.
 *
 * Renders the real app through the GPU test renderer and captures screenshots
 * into `examples/screenshots/`, so the layout can be inspected after a run.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import React from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestRoot, hasNativeTestRenderer } from '@gpuix/react'
import { ChatApp } from './chat'

const describeNative = hasNativeTestRenderer ? describe : describe.skip
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'screenshots')

beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true })
})

describeNative('chat example', () => {
  it('renders the sidebar, transcript and composer', () => {
    const { render, renderer } = createTestRoot()
    render(<ChatApp />)

    const painted = renderer.getPaintedText()

    // Sidebar chrome.
    expect(painted).toContain('New chat')
    expect(painted).toContain('Today')
    expect(painted).toContain('Port selection from Comet')
    expect(painted).toContain('Tommy')

    // Top bar and composer.
    expect(painted).toContain('GPUIX')
    expect(painted).toContain('Ask anything')

    // Transcript content, from all three native text components.
    expect(painted.some((line) => line.includes('cross-element text selection'))).toBe(true)
    expect(painted.some((line) => line.includes('pub fn resolve_spans'))).toBe(true)
  })

  it('selects message text but never sidebar titles', () => {
    const { render, renderer } = createTestRoot()
    render(<ChatApp />)

    // A drag across the sidebar must select nothing: the chrome opts out.
    expect(renderer.dragSelect(30, 300, 240, 320)).toBeNull()

    // A drag across the transcript selects the message.
    const selected = renderer.dragSelect(700, 96, 1100, 96)
    expect(selected).not.toBeNull()
    expect(selected).not.toContain('Port selection from Comet')
  })

  it('scrolls the transcript', () => {
    // The transcript is not virtualized, so every turn paints whether or not it
    // is on screen and `getPaintedText()` cannot see a scroll. Compare pixels.
    const top = path.join(SHOTS, 'chat-scroll-before.png')
    const down = path.join(SHOTS, 'chat-scroll-after.png')

    const { render, renderer } = createTestRoot()
    render(<ChatApp />)
    renderer.captureScreenshot(top)

    renderer.nativeSimulateScrollWheel(700, 400, 0, -1400)
    renderer.flush()
    renderer.captureScreenshot(down)

    expect(fs.readFileSync(top).equals(fs.readFileSync(down))).toBe(false)
  })

  it('types into the composer and clears on enter', () => {
    const { render, renderer } = createTestRoot()
    render(<ChatApp />)

    const input = renderer.findByType('input')[0]
    expect(input).toBeDefined()
    // In the running app `autoFocus` supplies the focus; the helper focuses
    // explicitly. Either way `<input>` is controlled, so this only passes if
    // the app appends `event.keyChar` on every keyDown.
    renderer.nativeSimulateKeystrokes(input.id, 'h i')
    expect(renderer.getPaintedText()).toContain('hi')

    renderer.nativeSimulateKeystrokes(input.id, 'backspace')
    expect(renderer.getPaintedText()).toContain('h')

    renderer.nativeSimulateKeystrokes(input.id, 'enter')
    // Cleared, so the placeholder is back.
    expect(renderer.getPaintedText()).toContain('Ask anything')
  })

  it('captures reference screenshots', () => {
    const top = path.join(SHOTS, 'chat-top.png')
    const table = path.join(SHOTS, 'chat-table-and-diff.png')
    const scrolled = path.join(SHOTS, 'chat-scrolled.png')
    const collapsed = path.join(SHOTS, 'chat-sidebar-collapsed.png')

    const { render, renderer } = createTestRoot()
    render(<ChatApp />)
    renderer.captureScreenshot(top)

    // Mid-transcript: the GFM table and the top of the diff viewer.
    renderer.nativeSimulateScrollWheel(700, 400, 0, -780)
    renderer.flush()
    renderer.captureScreenshot(table)

    renderer.nativeSimulateScrollWheel(700, 400, 0, -720)
    renderer.flush()
    renderer.captureScreenshot(scrolled)

    // Collapse the sidebar with its chevron.
    renderer.nativeSimulateClick(244, 26)
    renderer.flush()
    renderer.captureScreenshot(collapsed)

    for (const shot of [top, table, scrolled, collapsed]) {
      expect(fs.existsSync(shot)).toBe(true)
      expect(fs.statSync(shot).size).toBeGreaterThan(0)
    }
  })
})
