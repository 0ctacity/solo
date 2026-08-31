# Application commands

Register application commands through `@solo/solid`, inside a Solid component.
Commands belong to that component's owner and are removed when it unmounts.
Native application commands currently support macOS. Registration on other
platforms throws a clear unsupported-platform error.

```tsx
import { createSignal } from "solid-js"
import { registerApplicationCommand, Text } from "@solo/solid"

function Articles() {
  const [refreshing, setRefreshing] = createSignal(false)

  registerApplicationCommand({
    id: "articles.refresh",
    label: "Refresh",
    shortcut: "cmd-r",
    menu: "Article",
    enabled: () => !refreshing(),
    run: () => {
      setRefreshing(true)
      void refreshArticles().catch(console.error).finally(() => setRefreshing(false))
    },
  })

  return <Text>Articles</Text>
}
```

`refreshArticles` is application code. Handle its errors in the application,
just as for a button callback.

## Lifetime and state

- `id` must be unique among registered commands. Duplicate registration throws;
  it never replaces someone else's handler. An ID can be reused after disposal.
- `label` is the native menu label. `menu` is an optional top-level menu name.
- `shortcut` is optional. This is an application command, not a system-wide
  hotkey that runs while another application is active.
- `enabled` defaults to `true`; pass a boolean accessor to update it reactively.
  It controls both shortcut dispatch and the menu item's enabled state.
- All other options are fixed for the registration. Dispose and register again
  to change them.
- The returned function disposes early and is safe to call more than once.
  Solid owner cleanup handles ordinary component unmounts and app remounts.
- Native events carry a registration-specific token. A queued event from a
  disposed registration cannot invoke a new command with the same public ID.
- Registration failures are synchronous and leave existing commands intact.

Application code imports neither `@solo/core` nor `@solo/native`. The internal
bridge replaces a complete descriptor list; native menu and keyboard input
both emit the same application-command event to the Solid callback.

## Shortcuts and focus

- Use a single GPUI chord such as `cmd-r` or `cmd-shift-r`: exactly one of
  `cmd`, `ctrl`, or `alt`, optionally with `shift`. Multi-chord sequences and
  Tab shortcuts are rejected. `super` and `win` are aliases of `cmd`.
- Duplicate shortcuts are rejected even if one command is disabled. Existing
  GPUI editing/navigation bindings and Cmd+Q are reserved; registration cannot
  override them. Invalid replacements leave the previous bindings intact.
- Enabled commands take precedence over an element's raw `onKeyDown` handler
  in GPUI controls. Disabled/disposed commands no longer consume that shortcut.
  Ordinary typing, editing bindings, and Tab navigation remain native.
- WKWebView is an AppKit child view, not part of GPUI's keyboard dispatch tree.
  Give a command a `menu` to make its shortcut available through the macOS menu
  key-equivalent path while web content has focus. Shortcut-only commands have
  no such guarantee in web content. Solo does not intercept web-page key events.

## Verification

Headless tests cover registration, disposal/remounts, duplicate IDs, failed
registration, reactive enabled state, and stale native events. The packaged
regression exercises commands across native controls and checks that text
editing continues to work.

To build the standalone macOS verification app after building the native addon
and core package:

```sh
bun packages/solid/src/__tests__/fixtures/package-commands.ts
```

The script prints the executable path inside a temporary `Solo Commands.app`.
Use its Article menu, native input/textarea, enable/dispose buttons, and embedded
web input to check actual macOS event routing. Automated GPUI keyboard injection
does not by itself prove AppKit menu routing or WKWebView first-responder behavior.

Manual macOS verification also checks that typing in the web input still works,
Cmd+R invokes Refresh once with that input focused, and Article → Refresh invokes
the same callback once. Toggle enabled to inspect the disabled native menu item;
toggle registration to remove it and register it again without duplicate calls.
