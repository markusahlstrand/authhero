---
"@authhero/widget": patch
---

Render long pick-one screens (e.g. tenant selection) as a scrollable, searchable list.

When a screen's field section is made up entirely of choice buttons (`NEXT_BUTTON`) and there are more than five, the widget now shows a search box above the buttons and constrains them to a scrollable area instead of a tall column. Typing filters the buttons by their label client-side; Enter in the search box is suppressed so it never submits without a selection. Screens at or below the threshold are unaffected.

The search filter is now cleared on every screen transition (fetch and submit navigation paths), not just when the `screen` prop changes, so a query typed on one list never leaks into the next screen.
