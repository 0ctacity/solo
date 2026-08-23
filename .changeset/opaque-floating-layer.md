---
'@gpuix/react': patch
---

Give Select, Combobox, and Tooltip surfaces an opaque fill so window blur and page content do not show through the card.

`FloatingLayer` now defaults to `backgroundColor: "#1A1A1A"`. Pass your own `style.backgroundColor` to override.
