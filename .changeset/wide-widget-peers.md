---
"authhero": patch
---

Fix the optional @authhero/widget peer dependency range: it pointed at ^0.1.0, a version range with no published releases, which made `npm install` fail with ETARGET in any project that installs authhero together with @authhero/widget (as create-authhero scaffolds do). The range now tracks the widget versions authhero is actually built against (>=0.37.0 <1.0.0).
