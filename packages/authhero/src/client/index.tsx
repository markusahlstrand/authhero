/** @jsxImportSource hono/jsx */
import { StrictMode } from "hono/jsx";
import { hydrateRoot } from "hono/jsx/dom/client";
import { FormHandler } from "./form-handler";
import { PasswordToggle } from "./password-toggle";

/**
 * Client-side entry point for authentication pages
 *
 * This script hydrates the server-rendered HTML with client-side interactivity.
 * It attaches event handlers and enables progressive enhancement features.
 */

// Wait for DOM to be ready
const root = document.getElementById("client-root");

if (root) {
  hydrateRoot(
    root,
    <StrictMode>
      <FormHandler />
      <PasswordToggle />
    </StrictMode>,
  );
}
