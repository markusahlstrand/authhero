import type { Preview } from "@storybook/react";
import "../dist/tailwind.css";
import i18next from "i18next";
import enTranslations from "../src/locales/en/default.json";

// Initialize i18next for Storybook with actual English translations
i18next.init({
  lng: "en",
  fallbackLng: "en",
  debug: false,
  resources: {
    en: {
      translation: enTranslations,
    },
  },
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
