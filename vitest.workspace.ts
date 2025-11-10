import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "./apps/react-admin/vite.config.ts",
  "./packages/kysely/vite.config.ts",
  "./packages/cloudflare/vite.config.ts",
  "./packages/authhero/vite.config.ts",
]);
