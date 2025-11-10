import path from "path";
import { defineConfig } from "vite";

const getPackageName = () => {
  return "cloudflare-adapter";
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
      external: [
        "@authhero/adapter-interfaces",
        "@authhero/kysely-adapter",
        "wretch",
      ],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@@", replacement: path.resolve(__dirname) },
    ],
  },
});
