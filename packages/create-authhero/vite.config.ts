import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "create-authhero",
    },
    rollupOptions: {
      external: ["commander", "inquirer", "fs", "path"],
    },
  },
});
