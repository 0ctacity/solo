---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add native animations through the new `motion.div` React component.

```tsx
import { motion } from '@gpuix/react'

<motion.div
  initial={{ width: 0, opacity: 0 }}
  animate={{ width: 260, opacity: 1 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
>
  Sidebar content
</motion.div>
```

React sends the animation targets once. Rust interpolates the presentation style and requests GPUI frames without reconciling the React tree for each frame. Running animations can reverse or change target without jumping because each new transition starts from the current visible value.
