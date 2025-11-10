import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@@", replacement: path.resolve(__dirname) },
      {
        find: "@authhero/kysely-adapter",
        replacement: path.resolve(__dirname, "../kysely/src/index.ts"),
      },
      {
        find: "@authhero/adapter-interfaces",
        replacement: path.resolve(
          __dirname,
          "../adapter-interfaces/src/index.ts",
        ),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
  },
});
