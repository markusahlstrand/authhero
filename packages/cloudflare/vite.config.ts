import path from "path";
import { defineConfig } from "vite";

const getPackageName = () => {
  return "cloudflare-adapter";
};

const formats: Array<"es" | "cjs"> = ["es", "cjs"];

// Keep these out of the bundle. The app-level packages (authhero,
// multi-tenancy) are optional peers used only by the `/wfp` subpath; hono is a
// peer. Matches exact ids and their subpaths.
const externalDeps = [
  "@authhero/adapter-interfaces",
  "@authhero/kysely-adapter",
  "@authhero/multi-tenancy",
  "authhero",
  "hono",
  "@hono/zod-openapi",
  "wretch",
];

export default defineConfig({
  base: "./",
  build: {
    outDir: "./dist",
    lib: {
      // Three entries: the main barrel (`.`), the WFP control-plane-sync
      // surface (`./wfp`), and the durable tenant-operations surface
      // (`./workflows`). The main bundle name is unchanged so the `.`
      // export stays byte-stable.
      entry: {
        [getPackageName()]: path.resolve(__dirname, "src/index.ts"),
        wfp: path.resolve(__dirname, "src/wfp/index.ts"),
        workflows: path.resolve(__dirname, "src/workflows/index.ts"),
      },
      formats,
      fileName: (format, entryName) =>
        `${entryName}.${format === "es" ? "mjs" : "cjs"}`,
    },
    rollupOptions: {
      external: (id) =>
        externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`)),
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@@", replacement: path.resolve(__dirname) },
    ],
  },
});
