import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "./dist",
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "saml",
      formats: ["es", "cjs"],
      fileName: (format) => (format === "es" ? "saml.mjs" : "saml.cjs"),
    },
    rollupOptions: {
      external: ["@hono/zod-openapi", "xml-crypto"],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@@", replacement: path.resolve(__dirname) },
    ],
  },
});
