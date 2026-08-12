---
"@authhero/widget": patch
---

Disable the primary action button until every required field on the screen has
a value. The widget submits through its own handler rather than a native form
submit, so the browser's constraint validation never ran and an empty required
field only surfaced as a server error after a round trip. The same check also
blocks submit-on-Enter.

Also fixes BOOLEAN checkboxes: a `default_value` is now seeded into the form
data, so a box the user never touches submits the state it renders in, and
unticking a ticked-by-default box now sticks.
