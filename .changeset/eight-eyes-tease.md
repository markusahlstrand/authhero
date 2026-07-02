---
"create-authhero": patch
---

Fix the aws-sst template to depend on `@authhero/aws-adapter` (the published package) instead of the non-existent `@authhero/aws`, and add a test suite that scaffolds every template and verifies the generated files, dependency names, and that generated/template code only imports things the authhero packages actually export.
