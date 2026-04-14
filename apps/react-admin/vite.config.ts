/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    environment: "jsdom", // Set JSDOM as the default test environment
    globals: true, // Make test globals available
    css: true, // Enable CSS processing for tests
    env: {
      VITE_AUTH0_API_URL: "http://localhost:3000",
      VITE_AUTH0_DOMAIN: "test.auth0.com",
    },
    alias: {
      // @tiptap packages have broken exports for Vitest's resolver
      "@tiptap/react": path.resolve(__dirname, "src/__mocks__/tiptap.ts"),
      "@tiptap/starter-kit": path.resolve(__dirname, "src/__mocks__/tiptap.ts"),
      "@tiptap/extension-link": path.resolve(
        __dirname,
        "src/__mocks__/tiptap.ts",
      ),
      "@tiptap/extension-underline": path.resolve(
        __dirname,
        "src/__mocks__/tiptap.ts",
      ),
    },
    server: {
      deps: {
        // Workaround for React Admin ES module issues
        inline: [
          "ra-ui-materialui",
          "ra-core",
          "react-admin",
          "@mui/material",
          "@mui/icons-material",
          "react-admin-color-picker",
          "react-color",
        ],
      },
    },
  },
});
