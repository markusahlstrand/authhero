---
"@authhero/widget": patch
---

Fix theme/branding options that were set but never applied. Several CSS variables produced by the theme were read under a different name (or not at all) by the component CSS, so the corresponding Auth0-style theme settings had no visible effect. Now wired up:

- **Input Filled Text** (`input_filled_text`) — input/select text now uses this color instead of the body text color.
- **Header** color (`header`) — title/header text color now applies.
- **Secondary button** label and border colors (`secondary_button_label`, `secondary_button_border`).
- **Widget border** color and weight (`widget_border`, `widget_border_weight`).
- **Base focus color** (`base_focus_color`) — focus-ring outlines.
- **Base hover color** (`base_hover_color`) — primary button hover now derives a darker shade by default and honors the configured hover color.
- **Icons** color (`icons`).
- **Input border weight** (`input_border_weight`) and phone field radius/background now follow the input settings.
- **Font sizes/weights** for buttons, labels, links, body text, and subtitle.
- **Custom font** (`font_url`) — the font stylesheet is now loaded so the `ulp-font` family resolves.
