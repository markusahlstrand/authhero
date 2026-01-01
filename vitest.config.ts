import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude these paths from root-level test discovery
    // They either use different test runners or need migration
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Uses Stencil's test runner, not vitest
      "packages/ui-widget/**",
      // Legacy tests that need migration to a proper package
      "test/**",
    ],
  },
});
