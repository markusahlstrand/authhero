---
"@authhero/widget": patch
---

Fix DATE and TEL field regressions in the node component.

- Pasting a date with a two-digit year ("15/03/85") now expands the year the
  same way typing one does, instead of failing validation and falling through
  to the browser's own paste.
- A TEL field no longer loses the country the user picked. The widget mirrors
  every emitted value back onto the `value` prop, and re-parsing that echo
  moved anyone on a shared dial code (Canada, Kazakhstan, the +44 islands) to
  the first country in the table with that code.
- An explicit `YY` format renders a `YYYY` placeholder, matching the four
  digits the segment actually accepts.
- The DATE segment group keeps a visible focus indicator in forced-colors
  mode, where the `box-shadow` it relied on is suppressed.
