import path from "path";
import { defineConfig } from "vite";

const getPackageName = () => {
  return "aws-adapter";
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

const fileName = {
  es: `${getPackageName()}.mjs`,
  cjs: `${getPackageName()}.cjs`,
};

const formats = Object.keys(fileName) as Array<keyof typeof fileName>;

export default defineConfig({
  base: "./",
  build: {
    outDir: "./dist",
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: getPackageNameCamelCase(),
      formats,
      fileName: (format) => fileName[format],
    },
    rollupOptions: {
      // Matches exact ids and their subpaths — Rollup's `external` array does
      // exact string matching, so subpath imports (e.g. "hono/http-exception")
      // would otherwise be inlined. A bundled copy of hono means
      // HTTPExceptions thrown here fail the host app's `instanceof` checks.
      external: (id) =>
        [
          "@authhero/adapter-interfaces",
          "@authhero/proxy",
          "@aws-sdk/client-dynamodb",
          "@aws-sdk/lib-dynamodb",
          "@hono/zod-openapi",
          "hono",
          "nanoid",
        ].some((dep) => id === dep || id.startsWith(`${dep}/`)),
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@@", replacement: path.resolve(__dirname) },
    ],
  },
});
