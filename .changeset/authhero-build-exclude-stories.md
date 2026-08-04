---
"authhero": patch
---

Exclude Storybook `*.stories.tsx` fixtures from the package declaration build
(`tsconfig.types.json`). The stories were pulled into the shipped build via
`include: ["src"]`, and a `Meta<typeof Component>` typing quirk (Storybook 10 +
React 19) that only surfaces in CI's clean install was failing `pnpm build`.
Stories are dev-only and never part of the bundle, so a dev-only typing
artifact should not gate the release build.
