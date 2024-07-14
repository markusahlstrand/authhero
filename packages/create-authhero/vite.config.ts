import { defineConfig } from "vite";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default defineConfig({
  publicDir: "templates",
  build: {
    target: "node16",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "create-authhero",
    },
    rollupOptions: {
      external: ["commander", "inquirer", "fs", "path", "url"],
      plugins: [
        nodeResolve({
          preferBuiltins: true,
        }),
        commonjs(),
      ],
    },
  },
});
