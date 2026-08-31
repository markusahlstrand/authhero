---
"create-authhero": patch
---

Scaffold the `aws-sst` template against SST v4 instead of v3. The generated `package.json` now pins `sst: "^4.0.0"`. The template's `sst.config.ts` needed no rewrite — it only uses SST's own components, and SST v4's breaking changes are confined to the underlying Pulumi AWS provider, which is reachable only through `transform` or a direct `@pulumi/aws` import. The custom-domain example in that config was also corrected: `domain` is a constructor option on `sst.aws.ApiGatewayV2`, not a property you assign after construction.
