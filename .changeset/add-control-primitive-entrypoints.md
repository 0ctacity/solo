---
'@gpuix/react': minor
---

Add dedicated Select, Combobox, and Tooltip primitive entry points for
shadcn-style local component files.

```tsx
import * as SelectPrimitive from '@gpuix/react/select'

<SelectPrimitive.Root>
  <SelectPrimitive.Trigger>
    <SelectPrimitive.Value placeholder="Select a model" />
  </SelectPrimitive.Trigger>
  <SelectPrimitive.Content>
    <SelectPrimitive.Item value="sonnet">Sonnet</SelectPrimitive.Item>
  </SelectPrimitive.Content>
</SelectPrimitive.Root>
```

Applications can wrap these unstyled primitives in `components/ui/*.tsx`, add
their own styles and variants, and use the resulting local components without
changing the native behavior layer.
