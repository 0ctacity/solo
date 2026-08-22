---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add headless Select, Combobox, and Tooltip components with the same compound
composition used by shadcn.

```tsx
<Select value={model} onValueChange={setModel}>
  <SelectTrigger>
    <SelectValue placeholder="Select a model" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="sonnet">Sonnet</SelectItem>
    <SelectItem value="opus">Opus</SelectItem>
  </SelectContent>
</Select>
```

Each part accepts GPUIX styles, including state-based item style functions.
Menus support native focus, keyboard navigation, outside-click dismissal,
window-edge snapping, and click occlusion. Comboboxes use the native text input
and rank prefix matches before substring matches.
