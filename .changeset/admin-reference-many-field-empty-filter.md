---
"@authhero/admin": patch
---

Fix `ReferenceManyField` hiding its `FilterForm` when a filter search returned zero results. The empty state now only renders when no filters are active, so users can keep refining their search instead of the form disappearing on them.
