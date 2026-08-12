---
"@authhero/widget": patch
---

Add a multi-step Form to the widget demo server.

The demo only ever served hand-built login screens, so form nodes — the other
half of what the widget renders — could only be exercised against a real
tenant. It now serves a three-step `profile_completion` form from
`/u2/forms/:formId/nodes/:nodeId`, the same route shape production uses, built
from STEP nodes chained by `next_node` and covering TEXT, DATE, DROPDOWN,
CHOICE, TEL, LEGAL, BOOLEAN, RICH_TEXT and the previous/next buttons.

Required fields are validated server-side and answers accumulate across steps,
so a validation error or a Back click re-renders the step with what was already
typed — the demo's stand-in for `accumulateFormValues`. The steps show up in
the demo's screen dropdown and work in every mode it offers (path URLs, SSR +
hydration, theming, dark mode, mobile frame).

No change to the published component; demo-server is not part of the package.
