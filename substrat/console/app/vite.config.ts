import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset refs so the inlined bundle serves from any path.
  base: "./",
  build: { outDir: "dist" },
  server: {
    port: 5174,
    // Dev convenience: proxy API calls to the local harness (node server or
    // wrangler dev). The built SPA talks same-origin — no proxy involved.
    proxy: {
      "/op": "http://localhost:8788",
      "/me": "http://localhost:8788",
    },
  },
});
