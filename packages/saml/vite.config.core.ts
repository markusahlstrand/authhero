import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "./dist",
    emptyOutDir: false, // Don't clear dist folder
    lib: {
      entry: path.resolve(__dirname, "src/core.ts"),
      name: "samlCore",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "core.mjs" : "core.cjs"),
    },
    rollupOptions: {
      external: ["@hono/zod-openapi"],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@@", replacement: path.resolve(__dirname) },
    ],
  },
});
