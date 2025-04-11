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

// Destination files
const outputCssFile = path.resolve(__dirname, 'dist/tailwind.css');
const outputTsFile = path.resolve(__dirname, 'src/styles/tailwind.ts');

// Ensure dist directory exists
const distDir = path.dirname(outputCssFile);
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
  .process(css, { from: inputFile, to: outputCssFile })
  .then(result => {
    // Write the result to the output CSS file
    fs.writeFileSync(outputCssFile, result.css);
    console.log(`Tailwind CSS build completed: ${outputCssFile}`);
    
    // Generate TypeScript file with CSS content as a string
    const cssContentCleaned = result.css.replaceAll('`', "'");
    const doubleEscaped = cssContentCleaned.replaceAll('\\', '\\\\');
    
    const tsContent = `export const tailwindCss = \`
${doubleEscaped}\`
`;
    
    // Write the TypeScript file
    fs.writeFileSync(outputTsFile, tsContent);
    console.log(`Tailwind CSS TypeScript file generated: ${outputTsFile}`);
  })
  .catch(error => {
    console.error('Error building Tailwind CSS:', error);
    process.exit(1);
  });