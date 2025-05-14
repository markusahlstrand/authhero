/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": process.env,
  },
  server: {
    host: true,
  },
  base: "./",
  // @ts-expect-error
  test: {
    environment: "jsdom", // Set JSDOM as the default test environment
    globals: true, // Make test globals available
  },
});
