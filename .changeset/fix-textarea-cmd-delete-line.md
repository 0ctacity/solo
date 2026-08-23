---
"@gpuix/native": patch
---

Fix **Cmd+Delete** and **Cmd+Backspace** in `<input>` and `<textarea>`.

On macOS these shortcuts now match the system text field:

- **Cmd+Backspace** deletes from the caret to the start of the line
- **Cmd+Delete** deletes from the caret to the end of the line

Before this, the keys did nothing because the editor had no binding for them.
