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
    env: {
      VITE_AUTH0_API_URL: "http://localhost:3000",
      VITE_AUTH0_DOMAIN: "test.auth0.com",
    },
    server: {
      deps: {
        // Workaround for React Admin ES module issues
        inline: ["ra-ui-materialui", "ra-core", "react-admin", "@mui/material", "@mui/icons-material"],
      },
    },
  },
});
