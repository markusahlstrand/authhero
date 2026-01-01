import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Escape a string for use in JavaScript string literals
 */
function escapeJs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/</g, "\\x3c")
    .replace(/>/g, "\\x3e");
}

/**
 * Validate and sanitize a URL for use in href/src attributes
 * Returns empty string if URL is invalid or uses dangerous protocol
 */
function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    // Only allow http, https, and data (for favicons) protocols
    if (!["http:", "https:", "data:"].includes(parsed.protocol)) {
      return "";
    }
    return escapeHtml(url);
  } catch {
    // If it's a relative URL, allow it after escaping
    if (url.startsWith("/")) {
      return escapeHtml(url);
    }
    return "";
  }
}

/**
 * Sanitize CSS color value - only allow safe color formats
 */
function sanitizeCssColor(color: string | undefined): string {
  if (!color) return "";
  // Allow: hex colors, rgb/rgba, hsl/hsla, named colors
  const safeColorPattern =
    /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)$/;
  if (safeColorPattern.test(color.trim())) {
    return color.trim();
  }
  return "";
}

/**
 * Build a CSS background value from page_background object
 */
function buildPageBackground(
  pageBackground:
    | {
        type?: string;
        start?: string;
        end?: string;
        angle_deg?: number;
      }
    | undefined,
): string {
  if (!pageBackground) return "#f5f5f5";

  const { type, start, end, angle_deg } = pageBackground;

  // Handle gradient backgrounds
  if (type === "linear-gradient" && start && end) {
    const sanitizedStart = sanitizeCssColor(start);
    const sanitizedEnd = sanitizeCssColor(end);
    if (sanitizedStart && sanitizedEnd) {
      const angle = typeof angle_deg === "number" ? angle_deg : 180;
      return `linear-gradient(${angle}deg, ${sanitizedStart}, ${sanitizedEnd})`;
    }
  }

  // Handle solid color (use start as the color)
  if (start) {
    const sanitizedColor = sanitizeCssColor(start);
    if (sanitizedColor) return sanitizedColor;
  }

  return "#f5f5f5";
}

export const flowWidgetRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapi(
  createRoute({
    tags: ["flow-widget"],
    method: "get",
    path: "/:formId",
    request: {
      params: z.object({
        formId: z.string(),
      }),
      query: z.object({
        state: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Flow widget page",
        content: {
          "text/html": {
            schema: z.string(),
          },
        },
      },
    },
  }),
  async (ctx) => {
    const { formId } = ctx.req.valid("param");
    const { state } = ctx.req.valid("query");

    const { branding, client } = await initJSXRoute(ctx, state, true);

    // Build the flow API URL
    const baseUrl = new URL(ctx.req.url).origin;
    const flowApiUrl = `${baseUrl}/u/flow/${formId}/screen?state=${encodeURIComponent(state)}`;

    // Convert branding to CSS variables with sanitization
    const cssVariables: string[] = [];
    const primaryColor = sanitizeCssColor(branding?.colors?.primary);
    if (primaryColor) {
      cssVariables.push(`--ah-color-primary: ${primaryColor}`);
    }

    // Build page background (handles gradient objects)
    const pageBackground = buildPageBackground(branding?.colors?.page_background);

    // Sanitize URLs
    const faviconUrl = sanitizeUrl(branding?.favicon_url);
    const fontUrl = sanitizeUrl(branding?.font?.url);

    // Escape values for HTML context
    const clientName = escapeHtml(client.name || "AuthHero");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in - ${clientName}</title>
  ${faviconUrl ? `<link rel="icon" href="${faviconUrl}">` : ""}
  ${fontUrl ? `<link rel="stylesheet" href="${fontUrl}">` : ""}
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${pageBackground || "#f5f5f5"};
      font-family: ${fontUrl ? "'Inter', system-ui, sans-serif" : "system-ui, -apple-system, sans-serif"};
      padding: 20px;
    }
    
    authhero-widget {
      ${cssVariables.join(";\n      ")};
      max-width: 400px;
      width: 100%;
    }
    
    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    
    .error {
      background: #fee2e2;
      border: 1px solid #ef4444;
      color: #dc2626;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
  </style>
  <script type="module" src="/u/widget/authhero-widget.esm.js"></script>
</head>
<body>
  <authhero-widget id="widget">
    <div class="loading">Loading...</div>
  </authhero-widget>

  <script type="module">
    const widget = document.getElementById('widget');
    const flowApiUrl = '${escapeJs(flowApiUrl)}';
    let currentNodeId = null;
    
    // Fetch and render the current screen
    async function fetchScreen(nodeId = null) {
      try {
        let url = flowApiUrl;
        if (nodeId) {
          url += '&nodeId=' + encodeURIComponent(nodeId);
        }
        
        const response = await fetch(url, {
          method: 'GET',
          credentials: 'include',
        });
        
        if (!response.ok) {
          throw new Error('Failed to load screen');
        }
        
        const data = await response.json();
        
        if (data.screen) {
          // Set the screen on the widget
          widget.screen = data.screen;
          currentNodeId = nodeId;
          
          // Apply branding if present
          if (data.branding?.logo_url) {
            widget.logoUrl = data.branding.logo_url;
          }
        }
      } catch (error) {
        console.error('Error fetching screen:', error);
        widget.innerHTML = '<div class="error">Failed to load. Please try again.</div>';
      }
    }
    
    // Handle form submission
    async function submitForm(formData) {
      try {
        widget.loading = true;
        
        let url = flowApiUrl;
        if (currentNodeId) {
          url += '&nodeId=' + encodeURIComponent(currentNodeId);
        }
        
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ data: formData }),
        });
        
        const data = await response.json();
        
        // Handle redirect response
        if (data.redirect) {
          window.location.href = data.redirect;
          return;
        }
        
        // Handle next screen response
        if (data.screen) {
          widget.screen = data.screen;
          widget.loading = false;
          return;
        }
        
        // Handle completion
        if (data.complete) {
          widget.innerHTML = '<div class="loading">Authentication complete. Redirecting...</div>';
          return;
        }
        
      } catch (error) {
        console.error('Error submitting form:', error);
        widget.loading = false;
      }
    }
    
    // Handle social login
    async function handleSocialLogin(provider) {
      // Redirect to the social login endpoint
      const socialUrl = '/authorize?' + new URLSearchParams({
        connection: provider,
        state: '${escapeJs(state)}',
      }).toString();
      window.location.href = socialUrl;
    }
    
    // Event listeners
    widget.addEventListener('submit', (e) => {
      e.preventDefault();
      submitForm(e.detail.data);
    });
    
    widget.addEventListener('buttonClick', (e) => {
      const { type, value } = e.detail;
      
      if (type === 'oidc' || type === 'social') {
        handleSocialLogin(value);
      }
    });
    
    widget.addEventListener('linkClick', (e) => {
      const { href } = e.detail;
      
      // Handle internal links
      if (href.startsWith('/u/')) {
        window.location.href = href + '?state=' + encodeURIComponent('${escapeJs(state)}');
      } else {
        window.location.href = href;
      }
    });
    
    // Initial load
    fetchScreen();
  </script>
</body>
</html>`;

    return ctx.html(html);
  },
);
