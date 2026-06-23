---
"authhero": patch
---

Fix Auth0-style full-document Universal Login templates rendering unstyled. The `{%- auth0:head -%}` slot now ships a centered body layout (page background, flex centering, font) in its page CSS, so a vanilla Auth0 page template (`<body>{%- auth0:widget -%}</body>`) renders centered on the page background instead of top-left on a blank page.
