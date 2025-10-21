import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "./dist",
    emptyOutDir: false, // Don't clear dist folder
    lib: {
      entry: path.resolve(__dirname, "src/local-signer.ts"),
      name: "samlLocalSigner",
      formats: ["es", "cjs"],
      fileName: (format) =>
        format === "es" ? "local-signer.mjs" : "local-signer.cjs",
    },
    rollupOptions: {
      external: ["xml-crypto"],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@@", replacement: path.resolve(__dirname) },
    ],
  },
});
