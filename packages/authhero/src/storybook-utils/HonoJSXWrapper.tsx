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

    // Hono JSX elements have a toString() method that renders them to HTML
    if (element && typeof element === "object" && "toString" in element) {
      return element.toString();
    }

    return String(element || "");
  } catch (error) {
    console.error("Error rendering Hono component:", error);
    return `<div style="color: red;">Error rendering component: ${error}</div>`;
  }
}

/**
 * Extract body content from a full HTML document
 * This is useful for rendering full-page components (like AuthLayout) in Storybook
 */
export function extractBodyContent(html: string): string {
  // Extract content between <body> and </body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch && bodyMatch[1]) {
    return bodyMatch[1];
  }

  // If no body tag found, return the original HTML
  return html;
}

/**
 * Wrapper for rendering full HTML documents in Storybook
 * Extracts just the body content to display in the Storybook iframe
 * Uses display:contents to make the wrapper transparent to layout,
 * allowing the inner flex container to work properly
 */
export function HonoFullPageWrapper({ html }: { html: string }) {
  const bodyContent = extractBodyContent(html);

  return React.createElement("div", {
    dangerouslySetInnerHTML: { __html: bodyContent },
    className: "storybook-full-page-wrapper",
    style: {
      display: "contents",
    },
  });
}
