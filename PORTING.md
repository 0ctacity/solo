# React → Solid test porting status

React support was removed in this milestone. The suites below lived in
`packages/react/src/__tests__/` and exercise **native** renderer behavior;
they are preserved in git history at the commit that deleted
`packages/react`. Port them to `packages/solid/src/__tests__/` against
`createSolidNativeTestRoot()` (macOS-only, mirrors React's harness).

## Ported
- input.test.tsx            → native-input.test.tsx (11 tests)
- automation-protocol.test  → moved to @gpuix/core (5 tests)
- automation-stdio.test     → moved to @gpuix/core (3 tests)
- lifecycle coverage        → packages/solid lifecycle.test.tsx + layout probe

## Not yet ported (port these next)
- styles.test.tsx           (32 tests — per-prop style→native mapping)
- events.test.tsx           (38 tests — event payload shapes)
- markdown.test.tsx         (15 tests)
- selection.test.tsx        (12 tests) / selection-layout.test.tsx (11)
- code.test.tsx             (12)
- diff-native.test.tsx      (18)
- floating-controls.test.tsx(12)
- showcase.test.tsx         (6)
- virtual-list.test.tsx     (8)
- img.test.tsx              (3)
- render.test.tsx           (11)
- debug-frame-overlay.test  (5)
