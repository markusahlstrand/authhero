import dts from "rollup-plugin-dts";

export default {
  input: "./dist/types/index.d.ts",
  output: { file: "./dist/cloudflare-adapter.d.ts", format: "es" },
  external: (id) => !id.startsWith(".") && !id.startsWith("/"),
  plugins: [dts({ respectExternal: false })],
};
