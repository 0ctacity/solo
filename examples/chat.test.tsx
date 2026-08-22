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
import { ChatApp, SafeMdxTranscript } from './chat'

const describeNative = hasNativeTestRenderer ? describe : describe.skip
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'screenshots')

beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true })
})

describeNative('chat example', () => {
  it('renders safe-mdx through GPUIX primitives', () => {
    const { render, renderer } = createTestRoot()
    render(<SafeMdxTranscript />)

    const screenshot = path.join(SHOTS, 'chat-safe-mdx.png')
    renderer.captureScreenshot(screenshot)

    expect(renderer.findByType('markdown')).toHaveLength(0)
    expect(renderer.findByType('code')).toHaveLength(1)
    expect(fs.statSync(screenshot).size).toBeGreaterThan(0)
    expect(renderer.getPaintedText()).toMatchInlineSnapshot(`
      [
        "Can Markdown be composed as normal React elements instead?",
        "React-composed Markdown",
        "This message uses ",
        "safe-mdx",
        ", ",
        "styled spans",
        ", ",
        "deleted text",
        ", an
      ",
        "inline code value",
        ", and ",
        "a link",
        ".",
        "The parser runs in TypeScript. Every Markdown node becomes a normal React component.",
        "GPUIX renders the resulting ",
        "div",
        ", ",
        "text",
        ", and ",
        "code",
        " tree.",
        "•",
        "nested ",
        "inline formatting",
        " inside a list",
        "•",
        "a second item with a long sentence that must wrap without leaving the transcript column",
        "✓",
        "a GFM task item",
        "Path",
        "Renderer",
        "Native Markdown element",
        "safe-mdx",
        "React tree",
        "no",
        "pulldown-cmark",
        "Rust tree",
        "yes",
        "typescript",
        "1",
        "const tree = mdxParse(source)",
        "2",
        "return <SafeMdxRenderer markdown={source} mdast={tree} />",
        "Custom MDX component",
        "MDX components also map to ordinary GPUIX React components.",
      ]
    `)
  })

  it('renders the sidebar, transcript and composer', () => {
    const { render, renderer } = createTestRoot()
    render(<ChatApp />)

    const transcript = renderer.findByType('virtual-list')[0]
    expect(transcript).toBeDefined()
    expect(
      transcript.children.map((id) => renderer.getElement(id)?.style.width)
    ).toEqual(Array(transcript.children.length).fill(1))

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
    // Compare pixels because visible virtual rows change after the scroll.
    const top = path.join(SHOTS, 'chat-scroll-before.png')
    const down = path.join(SHOTS, 'chat-scroll-after.png')

    const { render, renderer } = createTestRoot()
    render(<ChatApp />)
    expect(renderer.getPaintedText()).not.toContain('React-composed Markdown')
    renderer.captureScreenshot(top)

    renderer.nativeSimulateScrollWheel(700, 400, 0, -1400)
    const transcript = renderer.findByType('virtual-list')[0]
    renderer.scrollToItem(transcript.id, transcript.children.length - 1)
    renderer.captureScreenshot(down)

    expect(renderer.getPaintedText()).toContain('React-composed Markdown')
    expect(
      renderer.getPaintedText().some((line) => line.includes('cross-element text selection'))
    ).toBe(false)
    expect(fs.readFileSync(top).equals(fs.readFileSync(down))).toBe(false)
  })

  it('types into the composer and clears on enter', () => {
    const { render, renderer } = createTestRoot()
    render(<ChatApp />)

    const textarea = renderer.findByType('textarea')[0]
    expect(textarea).toBeDefined()
    renderer.nativeSimulateKeystrokes(textarea.id, 'h i')
    expect(renderer.getPaintedText()).toContain('hi')

    renderer.nativeSimulateKeystrokes(textarea.id, 'backspace')
    expect(renderer.getPaintedText()).toContain('h')

    renderer.nativeSimulateKeystrokes(textarea.id, 'enter')
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
  }, 15_000)
})
