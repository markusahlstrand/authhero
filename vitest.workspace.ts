import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // Reference vite.config.ts files to inherit their test configs
  "./apps/react-admin/vite.config.ts",
  "./packages/kysely/vite.config.ts",
  "./packages/cloudflare/vite.config.ts",
  "./packages/authhero/vite.config.ts",
  // Excluded from vitest:
  // - packages/ui-widget: Uses Stencil's test runner (pnpm test in that package)
  // - test/routes: Legacy tests that need migration to a proper package
]);
