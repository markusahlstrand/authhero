---
"@authhero/admin": patch
---

Hide the React Email inbox-preview padding line from the email-template body editor by default. The Monaco `setHiddenAreas` API removes the noisy zero-width-character line from view without touching the underlying template. A "Hide invisible characters" toggle below the editor lets you reveal the line if needed, with a short explainer noting why those characters are there and shouldn't be removed. `CodeInput` now accepts an `editorOptions` prop and an `onEditorMount` callback for accessing the underlying Monaco editor.
