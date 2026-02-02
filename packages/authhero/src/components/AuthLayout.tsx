import { Branding, Theme } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import { PropsWithChildren } from "hono/jsx";
import cn from "classnames";
import i18next from "i18next";

type AuthLayoutProps = {
  title: string;
  theme?: Theme | null;
  branding?: Branding | null;
  client?: EnrichedClient | null;
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
  let paddingClass = "p-6 md:p-10";
  if (pageLayout === "left") {
    justifyClass = "justify-start";
    paddingClass = "pl-12 pr-6 py-6 md:pl-20 md:pr-10 md:py-10";
  } else if (pageLayout === "right") {
    justifyClass = "justify-end";
    paddingClass = "pr-12 pl-6 py-6 md:pr-20 md:pl-10 md:py-10";
  }

  const containerClasses = cn(
    "min-h-screen w-full flex bg-cover bg-center",
    justifyClass,
    paddingClass,
  );

  const inlineStyles = {
    ...(backgroundImageValue && { backgroundImage: backgroundImageValue }),
    backgroundColor: backgroundColor,
    // Ensure proper flex behavior and full viewport coverage
    display: "flex",
    alignItems: "stretch", // Changed from center to allow content to grow
    justifyContent:
      pageLayout === "left"
        ? "flex-start"
        : pageLayout === "right"
          ? "flex-end"
          : "center",
    minHeight: "100vh",
    width: "100%",
  };

  const contentWrapperClasses = cn(
    "w-full max-w-sm",
    // Center vertically within flex container, allowing overflow
    "flex flex-col justify-center",
  );

  return (
    <html lang={i18next.language || "en"}>
      <head>
        <title>{title}</title>
        <meta charset="UTF-8" />
        <meta name="robots" content="noindex, follow" />
        <link rel="stylesheet" href="/u/css/tailwind.css" />
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
          <div className={contentWrapperClasses}>
            {children}
            {branding?.powered_by_logo_url && (
              <div className="mt-5 text-left">
                <a
                  href="https://authhero.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block"
                >
                  <img
                    src={branding.powered_by_logo_url}
                    alt="Powered by"
                    className="h-9 opacity-60 hover:opacity-100 transition-opacity"
                  />
                </a>
              </div>
            )}
          </div>
        </div>
        {/* Mount point for client-side hydration */}
        <div id="client-root"></div>
        <script type="module" src="/u/js/client.js" />
      </body>
    </html>
  );
};

export default AuthLayout;
