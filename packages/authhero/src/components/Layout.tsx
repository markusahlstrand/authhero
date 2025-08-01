import { VendorSettings } from "@authhero/adapter-interfaces";
import AppLogo from "./AppLogo";
import i18next from "i18next";
import Footer from "./Footer";
import Icon from "./Icon";
import { html } from "hono/html";
import { PropsWithChildren } from "hono/jsx";

type LayoutProps = {
  title: string;
  vendorSettings: VendorSettings;
};

const globalDocStyle = (vendorSettings: VendorSettings) => {
  const { style } = vendorSettings;
  // cannot render CSS directly in JSX but we can return a template string
  return `
    body {
      --primary-color: ${style.primaryColor};
      --primary-hover: ${style.primaryHoverColor};
      --text-on-primary: ${style.buttonTextColor};
    }
  `;
};

const DEFAULT_BG = "https://assets.sesamy.com/images/login-bg.jpg";

const Layout = ({
  title,
  children,
  vendorSettings,
}: PropsWithChildren<LayoutProps>) => {
  const inlineStyles = {
    backgroundImage: `url(${
      vendorSettings?.loginBackgroundImage || DEFAULT_BG
    })`,
  };

  return (
    <html lang="en">
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
        <style>{globalDocStyle(vendorSettings)}</style>
        <meta name="theme-color" content="#000000" />
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
                  <AppLogo vendorSettings={vendorSettings} />
                </div>
                <div className="flex flex-1 flex-col">
                  {children}
                  <Footer vendorSettings={vendorSettings} />
                </div>
              </div>

              <div className="flex w-full items-center px-6 pb-8 pt-4 justify-between">
                <div className="flex justify-center leading-[0]">
                  <a href="https://sesamy.com" target="_blank" rel="noreferrer">
                    <Icon name="sesamy" className="text-xl text-white" />
                  </a>
                </div>
                <div className="flex justify-center space-x-2 text-xs text-white sm:justify-normal md:text-xs">
                  {vendorSettings.supportUrl && (
                    <a
                      className="text-xs text-white hover:underline md:text-xs"
                      href={vendorSettings.supportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {i18next.t("contact_support")}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
      {html`
        <script>
          // Add loading class to submit button on form submission
          document.addEventListener("DOMContentLoaded", function () {
            var form = document.getElementById("form");
            if (form) {
              var submitBtn = form.querySelector("button[type=submit]");
              if (submitBtn) {
                form.onsubmit = function () {
                  submitBtn.classList.add("is-loading");
                };
                // Remove loading class if the page is loaded from browser bfcache
                window.addEventListener("pageshow", function (event) {
                  if (event.persisted) {
                    submitBtn.classList.remove("is-loading");
                  }
                });
              }
            }
          });
        </script>
      `}
    </html>
  );
};

export default Layout;
