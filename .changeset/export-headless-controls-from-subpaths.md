---
'@gpuix/react': minor
---

Export Select, Combobox, and Tooltip from dedicated entry points so they can be imported with shadcn-style `Root` / `Content` names.

```tsx
import { Root, Trigger, Content, Item, Value } from '@gpuix/react/select'
import { Root as Combobox, Input, List } from '@gpuix/react/combobox'
import { Provider, Root as Tooltip, Trigger as TooltipTrigger, Content as TooltipContent } from '@gpuix/react/tooltip'

<Root value={model} onValueChange={setModel}>
  <Trigger>
    <Value placeholder="Select a model" />
  </Trigger>
  <Content>
    <Item value="sonnet">Sonnet</Item>
  </Content>
</Root>
```

The barrel `@gpuix/react` still exports the prefixed names (`Select`, `SelectTrigger`, and the rest). It no longer star-exports the modules, because `Root` and `Content` would collide across the three controls.
