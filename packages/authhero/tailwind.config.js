const tailwindRowsColumns = require("@ape-egg/tailwind-rows-columns");

/** @type {import('tailwindcss').Config} */
module.exports = {
  plugins: [tailwindRowsColumns],
  content: ["./src/components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        short: {
          raw: "(max-height: 900px) and (min-width: 640px)", // 640px = sm. Prevent this from ever triggering on phones
        },
      },
      colors: {
        primary: "var(--primary-color)",
        primaryHover: "var(--primary-hover)",
        textOnPrimary: "var(--text-on-primary)",
      },
      fontFamily: {
        sans: [
          '"KHTeka"',
          '"Helvetica Neue"',
          "HelveticaNeue",
          '"TeX Gyre Heros"',
          "TeXGyreHeros",
          "FreeSans",
          '"Nimbus Sans L"',
          '"Liberation Sans"',
          "Arimo",
          "Helvetica",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
