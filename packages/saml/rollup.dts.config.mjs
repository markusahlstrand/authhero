import dts from "rollup-plugin-dts";

const external = (id) => !id.startsWith(".") && !id.startsWith("/");
const plugins = [dts({ respectExternal: false })];

export default [
  {
    input: "./dist/types/index.d.ts",
    output: { file: "./dist/saml.d.ts", format: "es" },
    external,
    plugins,
  },
  {
    input: "./dist/types/core.d.ts",
    output: { file: "./dist/core.d.ts", format: "es" },
    external,
    plugins,
  },
  {
    input: "./dist/types/local-signer.d.ts",
    output: { file: "./dist/local-signer.d.ts", format: "es" },
    external,
    plugins,
  },
];
