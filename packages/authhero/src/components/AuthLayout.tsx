import { Branding, Theme, LegacyClient } from "@authhero/adapter-interfaces";
import { PropsWithChildren } from "hono/jsx";
import { html } from "hono/html";
import cn from "classnames";

type AuthLayoutProps = {
  title: string;
  theme?: Theme | null;
  branding?: Branding | null;
  client?: LegacyClient | null;
};

const DEFAULT_BG = "https://assets.sesamy.com/images/login-bg.jpg";

/**
 * AuthLayout - A responsive layout component for authentication pages
 * Supports three layout modes based on theme.page_background.page_layout:
 * - center: Centers the content (default)
 * - left: Aligns content to the left
 * - right: Aligns content to the right
 */
const AuthLayout = ({
  title,
  children,
  theme,
  branding,
}: PropsWithChildren<AuthLayoutProps>) => {
  const pageLayout = theme?.page_background?.page_layout || "center";
  const backgroundColor = theme?.page_background?.background_color || "#ffffff";

  // Check if background_image_url is explicitly set (including empty string)
  const backgroundImageUrl = theme?.page_background?.background_image_url;
  const backgroundImage =
    backgroundImageUrl !== undefined && backgroundImageUrl !== null
      ? backgroundImageUrl
      : DEFAULT_BG;

  // Determine if the background is a CSS gradient or a URL
  const isGradient =
    backgroundImage?.startsWith("linear-gradient") ||
    backgroundImage?.startsWith("radial-gradient") ||
    backgroundImage?.startsWith("conic-gradient");

  // Format the background image value
  const backgroundImageValue = backgroundImage
    ? isGradient
      ? backgroundImage
      : `url(${backgroundImage})`
    : undefined;

  // Determine the layout classes based on page_layout
  let justifyClass = "justify-center";
  if (pageLayout === "left") {
    justifyClass = "justify-start";
  } else if (pageLayout === "right") {
    justifyClass = "justify-end";
  }

  const containerClasses = cn(
    "min-h-screen w-full flex items-center p-6 md:p-10 bg-cover bg-center",
    justifyClass,
  );

  const inlineStyles = {
    ...(backgroundImageValue && { backgroundImage: backgroundImageValue }),
    backgroundColor: backgroundColor,
    // Ensure proper flex behavior and full viewport coverage
    display: "flex",
    alignItems: "center",
    justifyContent:
      pageLayout === "left"
        ? "flex-start"
        : pageLayout === "right"
          ? "flex-end"
          : "center",
    minHeight: "100vh",
    width: "100%",
  };

  return (
    <html lang="en">
      <head>
        <title>{title}</title>
        <meta charset="UTF-8" />
        <meta name="robots" content="noindex, follow" />
        <link rel="stylesheet" href="/u/css/tailwind.css" />
        <link rel="stylesheet" href="/u/css/shadcn-ui.css" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <meta name="theme-color" content="#000000" />
        {branding?.favicon_url && (
          <link rel="icon" type="image/x-icon" href={branding.favicon_url} />
        )}
        {theme?.fonts?.font_url && (
          <link rel="stylesheet" href={theme.fonts.font_url} />
        )}
      </head>

      <body>
        <div className={containerClasses} style={inlineStyles}>
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </body>
      {html`
        <script>
          // Add loading class to submit button on form submission
          document.addEventListener("DOMContentLoaded", function () {
            var forms = document.querySelectorAll("form");
            forms.forEach(function (form) {
              var submitBtn = form.querySelector("button[type=submit]");
              if (submitBtn) {
                form.onsubmit = function () {
                  submitBtn.classList.add("is-loading");
                  submitBtn.disabled = true;
                };
                // Remove loading class if the page is loaded from browser bfcache
                window.addEventListener("pageshow", function (event) {
                  if (event.persisted) {
                    submitBtn.classList.remove("is-loading");
                    submitBtn.disabled = false;
                  }
                });
              }
            });
          });
        </script>
      `}
    </html>
  );
};

export default AuthLayout;
