---
"authhero": patch
---

Fix dark mode rendering black text on the universal login widget. Since the
default theme is now applied unconditionally, its light-mode colors
(`header`, `input_filled_text`, `secondary_button_label` = `#000000`) were set
as widget CSS vars that the dark-mode palette did not override — the header used
the newer `--ah-color-text-header` var name while the dark override only set the
legacy `--ah-color-header`, and input/secondary-button text had no dark override
at all. The dark palette now overrides `--ah-color-text-header`,
`--ah-color-input-text`, and `--ah-btn-secondary-text`, restoring readable
light text on dark surfaces.
