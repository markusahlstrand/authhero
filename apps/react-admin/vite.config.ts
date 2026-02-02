/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import http from "http";

// Redirect HTTP to HTTPS
const HTTPS_PORT = 5173;
const HTTP_PORT = 5172;

function startHttpRedirectServer() {
  const server = http.createServer((req, res) => {
    const host = req.headers.host?.replace(`:${HTTP_PORT}`, `:${HTTPS_PORT}`);
    res.writeHead(301, { Location: `https://${host}${req.url}` });
    res.end();
  });
  server.listen(HTTP_PORT, () => {
    console.log(
      `HTTP redirect server running on http://localhost:${HTTP_PORT} -> https://localhost:${HTTPS_PORT}`,
    );
  });
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    {
      name: "http-redirect",
      configureServer() {
        startHttpRedirectServer();
      },
    },
  ],
  define: {
    "process.env": process.env,
  },
  server: {
    host: true,
    https: {},
    port: HTTPS_PORT,
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
