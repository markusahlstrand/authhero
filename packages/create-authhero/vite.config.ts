import { defineConfig } from "vitest/config";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default defineConfig({
  publicDir: "templates",
  test: {
    include: ["test/**/*.test.ts"],
    // Tests spawn the CLI via tsx for each template, which is slow to boot.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  build: {
    target: "node16",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "create-authhero",
    },
    rollupOptions: {
      external: [
        "commander",
        "inquirer",
        "fs",
        "path",
        "crypto",
        "url",
        "child_process",
      ],
      plugins: [
        nodeResolve({
          preferBuiltins: true,
        }),
        commonjs(),
      ],
    },
  },
});
