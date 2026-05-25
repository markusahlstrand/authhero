import dts from "rollup-plugin-dts";

// Two-stage dts bundling:
//   1. `tsc -p tsconfig.types.json` emits per-file .d.ts files into dist/types/
//   2. This rollup config reads those pre-computed declarations and produces
//      a single bundled .d.ts at dist/authhero.d.ts.
//
// Going through pre-computed .d.ts (rather than letting rollup-plugin-dts
// re-resolve types from .ts source) avoids the inference timeouts that turn
// complex Zod `.extend()` chains into `any` in the bundled output.

// Side-effect imports (CSS, asset files) are runtime-only and have no .d.ts
// contribution — rollup-plugin-dts can't parse them and shouldn't try.
const ignoreSideEffectImports = {
  name: "ignore-side-effect-imports",
  resolveId(source) {
    if (/\.(css|scss|sass|less|svg|png|jpg|jpeg|gif|webp|woff2?)$/.test(source)) {
      return { id: source, external: true };
    }
    return null;
  },
};

export default {
  input: "./dist/types/index.d.ts",
  output: { file: "./dist/authhero.d.ts", format: "es" },
  // Anything not local stays as an `import` in the emitted .d.ts. Consumers
  // already resolve zod, hono, etc. from their own dependency tree.
  external: (id) => !id.startsWith(".") && !id.startsWith("/"),
  plugins: [ignoreSideEffectImports, dts({ respectExternal: false })],
};
