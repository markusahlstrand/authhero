import path from "path";
import { defineConfig } from "vite";

const getPackageName = () => {
  return "drizzle-adapter";
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

module.exports = defineConfig({
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
      // Everything declared in dependencies/peerDependencies stays external —
      // without this list, vite lib mode bundles them all. Matches exact ids
      // and their subpaths (e.g. "hono/http-exception", "drizzle-orm/batch");
      // a bundled copy of hono means HTTPExceptions thrown here fail the host
      // app's `instanceof` checks.
      external: (id) =>
        [
          "@authhero/adapter-interfaces",
          "@authhero/proxy",
          "drizzle-orm",
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
