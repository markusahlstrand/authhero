import type { Preview } from "@storybook/react";
import "../dist/tailwind.css";
import "../dist/shadcn-ui.css"; // Import shadcn UI styles separately
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

  // Load the client script after each story renders
  async beforeEach() {
    // Wait for the DOM to be ready
    if (document.readyState === "loading") {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true }),
      );
    }

    // Give the story time to render
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Load the actual built client script
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/dist/client.js";
    document.head.appendChild(script);
  },
};

export default preview;
