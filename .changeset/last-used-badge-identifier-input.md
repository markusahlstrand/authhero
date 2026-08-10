---
"@authhero/adapter-interfaces": minor
"authhero": minor
"@authhero/widget": minor
---

Show the "Last used" badge on the identifier input, not just social buttons (#1138 follow-up).

Previously the opt-in last-used hint could only badge a social connection button, so a previous email/SMS/password login left nothing on screen even though the cookie recorded it.

- The `EMAIL` and `TEXT` field configs in the Forms schema gain `last_used` and a server-translated `last_used_label`.
- The u2 identifier screen badges the identifier input when the cookie names an email, SMS, or database connection; the combined login screen does so for the database connection (passwordless keeps its badge on the "enter a code" button).
- The widget renders the badge as the same pill used on social buttons, pinned to the input's top-right corner, exposed via new `input-badge` / `input-badge-<component-id>` shadow parts. The input's border is left unchanged (a permanent primary outline would read as focus). The widget demo previews it when the "Last used" toggle is on and social buttons are hidden.
