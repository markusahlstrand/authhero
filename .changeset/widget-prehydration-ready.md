---
"@authhero/widget": patch
---

Keep values typed into server-rendered u2 fields before the widget hydrates (they were wiped and the submit button stayed disabled), and expose a `data-ready` attribute on `<authhero-widget>` that is set once the widget is interactive and removed while a submit or screen swap is in flight. E2E tests should wait on `authhero-widget[data-ready]`.
