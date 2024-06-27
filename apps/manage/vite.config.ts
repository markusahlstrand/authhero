import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": process.env,
  },
  server: {
    host: true,
  },
  base: "/",
  resolve: {
    alias: {
      "@authhero/manage": path.resolve(
        __dirname,
        "../../packages/manage/src/main.ts",
      ),
    },
  },
});
