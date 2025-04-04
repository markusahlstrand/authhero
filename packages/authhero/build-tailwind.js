const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

// Path to your Tailwind CSS config file
const tailwindConfig = require('./tailwind.config.js');

// Source file - your CSS with Tailwind directives
const inputFile = path.resolve(__dirname, 'src/styles/tailwind.css');

// Destination file
const outputFile = path.resolve(__dirname, 'dist/tailwind.css');

// Ensure dist directory exists
const distDir = path.dirname(outputFile);
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read the input CSS file
const css = fs.readFileSync(inputFile, 'utf8');

// Process the CSS with PostCSS, Tailwind CSS, and cssnano
postcss([
  tailwindcss(tailwindConfig),
  autoprefixer,
  cssnano({ preset: 'default' })
])
  .process(css, { from: inputFile, to: outputFile })
  .then(result => {
    // Write the result to the output file
    fs.writeFileSync(outputFile, result.css);
    console.log(`Tailwind CSS build completed: ${outputFile}`);
  })
  .catch(error => {
    console.error('Error building Tailwind CSS:', error);
    process.exit(1);
  });