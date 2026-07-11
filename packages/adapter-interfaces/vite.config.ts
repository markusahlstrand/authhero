import path from "path";
import { defineConfig } from "vite";

const getPackageName = () => {
  return "adapter-interfaces";
};

const getPackageNameCamelCase = () => {
  try {
    return getPackageName().replace(/-./g, (char) =>
      (char[1] || "").toUpperCase(),
    );
  } catch (err) {
    throw new Error("Name property in package.json is missing.");
  }
};

const extensions = {
  es: "mjs",
  cjs: "cjs",
};

const formats = Object.keys(extensions) as Array<keyof typeof extensions>;

export default defineConfig({
  base: "./",
  build: {
    outDir: "./dist",
    lib: {
      entry: {
        [getPackageName()]: path.resolve(__dirname, "src/index.ts"),
        // SQL-adapter helpers, published as the `/sql` subpath so they stay
        // out of the main adapter-contract surface.
        sql: path.resolve(__dirname, "src/sql/index.ts"),
      },
      name: getPackageNameCamelCase(),
      formats,
      fileName: (format, entryName) =>
        `${entryName}.${extensions[format as keyof typeof extensions]}`,
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
