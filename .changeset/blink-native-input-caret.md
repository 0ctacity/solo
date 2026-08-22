---
'@gpuix/native': patch
'@gpuix/react': patch
---

Blink the native input and textarea caret every 500ms while focused and idle. Editing or moving the caret makes it immediately solid, and blurring the field stops its repaint timer.

The caret colour is now configurable through the native theme:

```tsx
<input theme={{ caret: '#22c55e' }} />
```
