---
"@authhero/widget": patch
---

Fix TEL field country detection when typing an international prefix. The leading
`+` was stripped on every keystroke, so a dial code could never build up and
typing `+46` never switched the country picker to Sweden.
