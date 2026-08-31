import { beforeEach, describe, expect, it, vi } from "vitest"
import * as solo from "@solo/solid"

const platform = vi.hoisted(() => ({ openExternalUrl: vi.fn(), writeClipboardText: vi.fn() }))
vi.mock("@solo/native", async (original) => ({
  ...await original<typeof import("@solo/native")>(),
  ...platform,
}))

beforeEach(() => { vi.resetAllMocks() })

describe("public desktop actions", () => {
  it("opens browser URLs without requiring a mounted renderer", () => {
    const url = "https://example.com/article?q=%E4%B8%96%E7%95%8C&literal=$(echo)"
    solo.openExternalUrl(url)
    expect(platform.openExternalUrl).toHaveBeenCalledExactlyOnceWith(url)
  })

  it("writes Unicode, multiline, and empty text unchanged", () => {
    for (const text of ["Hello 世界 👋\nİstanbul", "", "https://example.com/?q=';$()"])
      solo.writeClipboardText(text)
    expect(platform.writeClipboardText.mock.calls).toEqual([
      ["Hello 世界 👋\nİstanbul"], [""], ["https://example.com/?q=';$()"],
    ])
  })

  it("rejects non-string arguments before platform dispatch", () => {
    for (const value of [undefined, null, 42, {}, new URL("https://example.com")]) {
      expect(() => solo.openExternalUrl(value as never)).toThrow("URL must be a string")
      expect(() => solo.writeClipboardText(value as never)).toThrow("Clipboard text must be a string")
    }
    expect(platform.openExternalUrl).not.toHaveBeenCalled()
    expect(platform.writeClipboardText).not.toHaveBeenCalled()
  })

  it("preserves catchable validation, platform, and unsupported errors", () => {
    const error = new Error("macOS refused the operation")
    platform.openExternalUrl.mockImplementation(() => { throw error })
    platform.writeClipboardText.mockImplementation(() => { throw error })
    expect(() => solo.openExternalUrl("https://example.com")).toThrow(error)
    expect(() => solo.writeClipboardText("text")).toThrow(error)
  })
})
