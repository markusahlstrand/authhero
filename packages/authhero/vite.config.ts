import path from "path";
import { defineConfig } from "vite";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { visualizer } from "rollup-plugin-visualizer";

const getPackageName = () => {
  return "authhero";
};

const getPackageNameCamelCase = () => {
  try {
    return getPackageName().replace(/-./g, (char) => char[1].toUpperCase());
  } catch (err) {
    throw new Error("Name property in package.json is missing.");
  }
};

const fileName = {
  es: `${getPackageName()}.mjs`,
  cjs: `${getPackageName()}.cjs`,
};

const formats = Object.keys(fileName) as Array<keyof typeof fileName>;

export default defineConfig(({ mode }) => {
  // Client build configuration
  if (mode === "client") {
    return {
      build: {
        rollupOptions: {
          input: path.resolve(__dirname, "src/client/index.tsx"),
          output: {
            entryFileNames: "client.js",
            format: "es",
          },
        },
        outDir: "./dist",
      },
      esbuild: {
        jsxImportSource: "hono/jsx/dom",
      },
    };
  }

  // Server build configuration (default)
  return {
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
        external: ["@hono/zod-openapi", "hono"],
        output: {
          assetFileNames: (assetInfo) => {
            if (assetInfo.name === "style.css") return "tailwind.css";
            return assetInfo.name || "";
          },
        },
        plugins: [
          visualizer({
            filename: "./dist/stats.html",
            open: false,
            gzipSize: true,
            brotliSize: true,
          }) as any,
        ],
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()] as any,
      },
    },
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "src") },
        { find: "@@", replacement: path.resolve(__dirname) },
      ],
    },
  };
});
