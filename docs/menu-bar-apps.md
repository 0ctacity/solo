# macOS menu-bar applications

Pass `menuBar` to `render()` to keep the application and its JavaScript work
alive after the last window closes. Without this option, Solo retains its
existing behavior and exits when the last window closes.

```tsx
import { render } from "@solo/solid"

const application = render(() => <App />, {
  title: "Newsprint",
  menuBar: {
    // Resolve this inside the packaged application. Relative paths are rejected.
    iconPath: "/Applications/Newsprint.app/Contents/Resources/menu-bar.png",
    tooltip: "Newsprint",
  },
})
```

The image is treated as an AppKit template image, so a monochrome asset adapts
to light and dark menu bars. The status-item menu contains `Open <title>` and
`Quit <title>` actions. Open activates the existing window or creates exactly
one replacement; Quit terminates the native event loop and JavaScript process.

The render root exposes the same lifecycle controls for application UI:

```ts
application.closeWindow()
application.showWindow()
application.quitApplication()
```

## State across reopening

Solo keeps the Solid owner, signals, timers, registered application commands,
retained element tree, and system-appearance subscription alive while no window
exists. Mutations continue updating that retained tree and the reopened window
paints its latest state.

A reopened window is a new native GPUI window. Window-local state therefore
resets: native focus, scroll handles, transient pointer state, and native child
views such as `WKWebView` instances are recreated. Applications that need to
restore focus or scroll position should keep those values in Solid state.

This capability is macOS-only. It keeps the process alive after window close;
it does not survive explicit Quit and does not provide launch-at-login behavior.
