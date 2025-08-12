import { Branding } from "@authhero/adapter-interfaces";

export const DEFAULT_BRANDING: Branding = {
  colors: {
    primary: "#7D68F4",
    page_background: {
      type: "solid",
      start: "#F8F9FB",
      end: "#F8F9FB",
      angle_deg: 0,
    },
  },
  logo_url:
    "https://assets.sesamy.com/static/images/sesamy/logos/sesamy_logo_black.svg",
  favicon_url: "https://assets.sesamy.com/images/favicon.ico",
  font: {
    url: "https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Regular.woff2",
  },
};
