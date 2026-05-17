/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
  },
  build: {
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react-hook-form",
      "react-router",
      "react-router-dom",
      "ra-core",
    ],
  },
  base: "./",
  test: {
    environment: "jsdom",
    globals: true,
    css: true,
    env: {
      VITE_AUTH0_API_URL: "http://localhost:3000",
      VITE_AUTH0_DOMAIN: "test.auth0.com",
    },
    server: {
      deps: {
        inline: ["ra-core", "react-admin"],
      },
    },
  },
});
