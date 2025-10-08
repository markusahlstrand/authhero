/** @jsxImportSource react */
import React from "react";

/**
 * Wrapper component to render Hono JSX components in Storybook
 * This takes the already-rendered HTML string from a Hono component
 */
export function HonoJSXWrapper({ html }: { html: string }) {
  return React.createElement("div", {
    dangerouslySetInnerHTML: { __html: html },
    className: "storybook-hono-wrapper",
  });
}

/**
 * Helper function to render a Hono component to HTML
 * Use this in your stories to convert Hono JSX to HTML before passing to React
 */
export function renderHonoComponent<T>(
  Component: (props: T) => any,
  props: T,
): string {
  try {
    const element = Component(props);
    console.log("Element type:", typeof element);
    console.log("Element constructor:", element?.constructor?.name);
    console.log("Has toString:", typeof element?.toString);

    // Hono JSX elements have a toString() method that renders them to HTML
    if (element && typeof element === "object" && "toString" in element) {
      const html = element.toString();
      console.log("toString result type:", typeof html);
      console.log("toString result length:", html?.length);
      console.log("First 100 chars:", html?.substring(0, 100));
      return html;
    }

    const fallback = String(element || "");
    console.log("Using fallback, type:", typeof fallback);
    return fallback;
  } catch (error) {
    console.error("Error rendering Hono component:", error);
    return `<div style="color: red;">Error rendering component: ${error}</div>`;
  }
}
