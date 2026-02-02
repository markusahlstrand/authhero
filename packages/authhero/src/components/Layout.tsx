import { Branding, Theme } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import AppLogo from "./AppLogo";
import Footer from "./Footer";
import Icon from "./Icon";
import { PropsWithChildren } from "hono/jsx";
import { lighten } from "../utils/color";
import i18next from "i18next";

type LayoutProps = {
  title: string;
  theme: Theme | null;
  branding: Branding | null;
  client: EnrichedClient | null;
};

const globalDocStyle = (theme: Theme | null, branding: Branding | null) => {
  // Use theme colors primarily, fallback to branding
  const primaryColor =
    theme?.colors?.primary_button || branding?.colors?.primary || "#000000";

  // Calculate hover color by lightening the primary color by 20%
  // But allow override from theme if explicitly set
  const hoverColor =
    theme?.colors?.base_hover_color || lighten(primaryColor, 0.2);

  const textOnPrimary = theme?.colors?.primary_button_label || "#ffffff";

  return `
    body {
      --primary-color: ${primaryColor};
      --primary-hover: ${hoverColor};
      --text-on-primary: ${textOnPrimary};
    }
  `;
};

const DEFAULT_BG = "https://assets.sesamy.com/images/login-bg.jpg";

const Layout = ({
  title,
  children,
  theme,
  branding,
  client,
}: PropsWithChildren<LayoutProps>) => {
  const inlineStyles = {
    backgroundImage: `url(${theme?.page_background?.background_image_url || DEFAULT_BG})`,
  };

  return (
    <html lang={i18next.language || "en"}>
      <head>
        <title>{title}</title>
        <meta charset="UTF-8" />
        <meta name="robots" content="noindex, follow" />
        <link
          rel="preload"
          href="https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Medium.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Bold.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={"/u/css/tailwind.css"} />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <style>{globalDocStyle(theme, branding)}</style>
        <meta name="theme-color" content="#000000" />
        {branding?.favicon_url && (
          <link rel="icon" type="image/x-icon" href={branding.favicon_url} />
        )}
      </head>

      <body>
        <div
          className="row min-h-full w-full overflow-hidden bg-cover bg-center text-sm sm:bg-fixed sm:bg-left-top sm:pt-16 py-2"
          style={inlineStyles}
        >
          <div className="row-up-left w-[calc(100%-theme(space.2)-theme(space.2))] max-w-[1295px] !flex-nowrap sm:w-[calc(100%-theme(space.16)-theme(space.16))]">
            <div className="column-left w-full sm:w-auto">
              <div className="relative flex w-full flex-col rounded-2xl bg-white px-5 py-10 dark:bg-gray-800 dark:text-white sm:min-h-[700px] sm:max-w-md sm:px-14 sm:py-14 md:min-w-[448px] short:min-h-[558px] min-h-[calc(100vh-83px)]">
                <div className="mb-16">
                  <AppLogo theme={theme} branding={branding} />
                </div>
                <div className="flex flex-1 flex-col">
                  {children}
                  <Footer theme={theme} branding={branding} client={client} />
                </div>
              </div>

              <div className="flex w-full items-center px-6 pb-8 pt-4 justify-between">
                <div className="flex justify-center leading-[0]">
                  <a href="https://sesamy.com" target="_blank" rel="noreferrer">
                    <Icon name="sesamy" className="text-xl text-white" />
                  </a>
                </div>
                <div className="flex justify-center space-x-2 text-xs text-white sm:justify-normal md:text-xs">
                  {/* For now, we'll comment out the support URL since it's not in Theme or Branding schema yet */}
                  {/* You might want to add supportUrl to the Theme or Branding schema */}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Mount point for client-side hydration */}
        <div id="client-root"></div>
      </body>
      <script type="module" src="/u/js/client.js" />
    </html>
  );
};

export default Layout;
