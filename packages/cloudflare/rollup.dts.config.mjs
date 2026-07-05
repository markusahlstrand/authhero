import dts from "rollup-plugin-dts";

const external = (id) => !id.startsWith(".") && !id.startsWith("/");

export default [
  {
    input: "./dist/types/index.d.ts",
    output: { file: "./dist/cloudflare-adapter.d.ts", format: "es" },
    external,
    plugins: [dts({ respectExternal: false })],
  },
  {
    input: "./dist/types/wfp/index.d.ts",
    output: { file: "./dist/wfp.d.ts", format: "es" },
    external,
    plugins: [dts({ respectExternal: false })],
  },
  {
    input: "./dist/types/workflows/index.d.ts",
    output: { file: "./dist/workflows.d.ts", format: "es" },
    external,
    plugins: [dts({ respectExternal: false })],
  },
];
