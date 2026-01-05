const fs = require("fs");
const path = require("path");

/**
 * Build script to create the assets directory with static files
 * that can be served by consumers using Cloudflare Workers Assets
 * or other static file serving mechanisms.
 *
 * Assets structure:
 *   dist/assets/
 *     u/
 *       css/
 *         tailwind.css     - Tailwind CSS for universal login pages
 *       js/
 *         client.js        - Client-side JavaScript bundle
 *       widget/
 *         authhero-widget.esm.js  - Widget entry point
 *         index.esm.js            - Widget main bundle
 *         p-*.js                  - Widget chunks
 */

const ASSETS_DIR = path.resolve(__dirname, "dist/assets");
const U_DIR = path.join(ASSETS_DIR, "u");
const CSS_DIR = path.join(U_DIR, "css");
const JS_DIR = path.join(U_DIR, "js");
const WIDGET_DIR = path.join(U_DIR, "widget");

// Ensure directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Copy a file
function copyFile(src, dest) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`  Copied: ${path.basename(src)}`);
    return true;
  }
  return false;
}

// Copy directory recursively
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return false;
  }

  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

console.log("Building assets directory...\n");

// Create directory structure
ensureDir(ASSETS_DIR);
ensureDir(U_DIR);
ensureDir(CSS_DIR);
ensureDir(JS_DIR);
ensureDir(WIDGET_DIR);

// Copy CSS files
console.log("CSS files:");
const tailwindSrc = path.resolve(__dirname, "dist/tailwind.css");

if (copyFile(tailwindSrc, path.join(CSS_DIR, "tailwind.css"))) {
  // Success
} else {
  console.log("  Warning: tailwind.css not found. Run build:tailwind first.");
}

// Copy JS files
console.log("\nJS files:");
const clientSrc = path.resolve(__dirname, "dist/client.js");

if (copyFile(clientSrc, path.join(JS_DIR, "client.js"))) {
  // Success
} else {
  console.log("  Warning: client.js not found. Run build:client first.");
}

// Copy widget files from @authhero/widget
console.log("\nWidget files:");
const widgetSrcPaths = [
  // Try workspace location first
  path.resolve(__dirname, "../ui-widget/dist/authhero-widget"),
  // Then try node_modules
  path.resolve(__dirname, "node_modules/@authhero/widget/dist/authhero-widget"),
];

let widgetCopied = false;
for (const widgetSrc of widgetSrcPaths) {
  if (fs.existsSync(widgetSrc)) {
    const files = fs.readdirSync(widgetSrc);
    for (const file of files) {
      copyFile(path.join(widgetSrc, file), path.join(WIDGET_DIR, file));
    }
    widgetCopied = true;
    break;
  }
}

if (!widgetCopied) {
  console.log(
    "  Warning: @authhero/widget not found. Install @authhero/widget to include widget assets.",
  );
}

// Calculate total size
let totalSize = 0;
function getDirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let size = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(entryPath);
    } else {
      size += fs.statSync(entryPath).size;
    }
  }
  return size;
}

totalSize = getDirSize(ASSETS_DIR);

console.log(`\nAssets build completed!`);
console.log(`  Location: ${ASSETS_DIR}`);
console.log(`  Total size: ${(totalSize / 1024).toFixed(2)} KB`);
console.log(
  `\nTo serve these assets with Cloudflare Workers, add to wrangler.toml:`,
);
console.log(`  [assets]`);
console.log(`  directory = "node_modules/authhero/dist/assets"`);
