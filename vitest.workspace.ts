import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./apps/react-admin/vite.config.ts",
  "./packages/kysely/vite.config.ts",
  "./packages/saml/vite.config.ts",
  "./packages/authhero/vite.config.ts",
]);
