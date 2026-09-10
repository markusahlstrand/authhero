/**
 * Login page chrome — the furniture around the widget card.
 *
 * Shared between the authhero login page (which renders it for real) and the
 * widget demo server (which previews it), so the two can't drift. Everything
 * here is framework-free: plain strings in, plain strings out, no JSX runtime
 * and no i18n stack.
 */
export * from "./types";
export * from "./html";
export * from "./colors";
export * from "./chrome";
export * from "./css";
