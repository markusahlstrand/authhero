const fs = require("fs");
const path = require("path");
const postcss = require("postcss");
const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");
const cssnano = require("cssnano");

// Path to shadcn Tailwind CSS config file
const tailwindConfig = require("./tailwind.shadcn.config.js");

// Source file - shadcn UI CSS
const inputFile = path.resolve(__dirname, "src/styles/shadcn-ui.css");

// Destination file
const outputCssFile = path.resolve(__dirname, "dist/shadcn-ui.css");

// Ensure dist directory exists
const distDir = path.dirname(outputCssFile);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read the input CSS file
const css = fs.readFileSync(inputFile, "utf8");

// Process the CSS with PostCSS, Tailwind CSS, and cssnano
postcss([
  tailwindcss(tailwindConfig),
  autoprefixer,
  cssnano({ preset: "default" }),
])
  .process(css, { from: inputFile, to: outputCssFile })
  .then((result) => {
    // Write the result to the output CSS file
    fs.writeFileSync(outputCssFile, result.css);
    console.log(`Shadcn UI CSS build completed: ${outputCssFile}`);
  })
  .catch((error) => {
    console.error("Error building shadcn UI CSS:", error);
    process.exit(1);
  });
