import dts from "rollup-plugin-dts";

export default [
  {
    input: "./dist/types/index.d.ts",
    output: { file: "./dist/adapter-interfaces.d.ts", format: "es" },
    external: (id) => !id.startsWith(".") && !id.startsWith("/"),
    plugins: [dts({ respectExternal: false })],
  },
  {
    input: "./dist/types/sql/index.d.ts",
    output: { file: "./dist/sql.d.ts", format: "es" },
    external: (id) => !id.startsWith(".") && !id.startsWith("/"),
    plugins: [dts({ respectExternal: false })],
  },
];
