---
"authhero": patch
---

Social login buttons (Google, Facebook, ...) on the universal login pages now
show a loading state and disable themselves on the first click, preventing the
user from firing several `/authorize` requests by clicking repeatedly. These
buttons render as plain anchor links, so the existing form `submit` handler
never saw them; a new client-side `LoadingLinkHandler` adds the shared
`is-loading` state (which sets `pointer-events: none`) on the first plain
left-click and clears it again when the page is restored from the browser's
back/forward cache.
