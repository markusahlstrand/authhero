---
"authhero": patch
---

Replace the deprecated `@react-email/components` dependency with the unified
`react-email` package (v6), which now ships the same components.

The email default templates in `src/emails/defaults/*.tsx` import from
`react-email` instead, and `compiled.ts` was regenerated. The rendered HTML
changes only through upstream fixes: `<Preview>` now also emits a `<title>`,
`<Body>` propagates `dir`/`lang`, `<Section>` padding moves from the outer
`<table>` to the inner `<td>` (renders correctly in Outlook), and the
`mso-text-raise` hint gained its `px` unit. Every Liquid placeholder is
unchanged, so tenant branding and per-send variables resolve exactly as before.
