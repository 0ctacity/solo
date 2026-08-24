/// GPUIX Playwright-like automation API.
///
/// Framework-neutral: the protocol speaks to whichever runtime (React or
/// Solid) opened the window. Locators query the retained tree through the
/// same native calls in both cases.

export * from "./protocol.js"
export * from "./client.js"
