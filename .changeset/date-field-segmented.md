---
"@authhero/widget": minor
"authhero": patch
---

Replace the native date input with a locale-aware segmented DATE field.

`input type="date"` rendered differently in every browser (a stepper in
Safari), kept its dd/mm/yyyy hint visible while half-filled, and needed a
calendar gesture to reach a year decades back — all wrong for a date typed
from memory, such as a birthdate.

The field is now three numeric segments with auto-advance, backspace-to-
previous, paste support, and two-digit year expansion ("85" becomes 1985,
anchored on `config.max` when the field has one). The submitted value is
unchanged: a single ISO `YYYY-MM-DD`, emitted only once the segments form a
real calendar date.

Segment order follows a new `locale` prop on the widget (`DD/MM/YYYY`,
`MM/DD/YYYY` or `YYYY-MM-DD`), which `authhero` resolves per request from
`ui_locales` then `Accept-Language`, keeping the region subtag that the
translation language drops. An explicit `config.format` on the component
overrides the locale.
