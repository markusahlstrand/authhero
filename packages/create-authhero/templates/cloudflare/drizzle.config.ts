import { defineConfig } from "drizzle-kit";

// ⚠️ WARNING: Do not run `drizzle-kit generate` or `npm run db:generate`
//
// This configuration is for reference only. Migrations are pre-generated and
// shipped with the @authhero/drizzle package. The schema is managed by AuthHero
// and should not be customized to ensure compatibility with future updates.
//
// To apply migrations:
//   Local:  npm run migrate
//   Remote: npm run db:migrate:remote

export default defineConfig({
  out: "./node_modules/@authhero/drizzle/drizzle",
  schema: "./node_modules/@authhero/drizzle/src/schema/sqlite/index.ts",
  dialect: "sqlite",
});
