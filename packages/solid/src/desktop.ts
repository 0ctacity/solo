import * as native from "@solo/native"

/**
 * Open an absolute HTTP/HTTPS URL in the default browser (macOS).
 * Throws on invalid input, unsupported platforms, or OS rejection. Success
 * means macOS accepted the request, not that the page finished loading.
 */
export function openExternalUrl(url: string): void {
  if (typeof url !== "string") throw new TypeError("URL must be a string")
  native.openExternalUrl(url)
}

/** Replace the macOS clipboard with plain Unicode text; throws on failure. */
export function writeClipboardText(text: string): void {
  if (typeof text !== "string") throw new TypeError("Clipboard text must be a string")
  native.writeClipboardText(text)
}
