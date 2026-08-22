---
'@gpuix/react': patch
---

Support React 19 components that return any valid `ReactNode` from the GPUIX JSX runtime.

Libraries such as `safe-mdx` can now render parsed content directly into GPUIX host elements without TypeScript rejecting their component return types.
