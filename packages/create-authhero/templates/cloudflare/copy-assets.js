#!/usr/bin/env node

/**
 * Copy AuthHero assets to dist directory
 *
 * This script copies static assets from the authhero package to the dist directory
 * so they can be served by Wrangler's Assets feature. Wrangler does not support
 * serving files directly from node_modules.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.join(
  __dirname,
  "node_modules",
  "authhero",
  "dist",
  "assets",
);
const targetDir = path.join(__dirname, "dist", "assets");

/**
 * Recursively copy directory contents
 */
function copyDirectory(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log("📦 Copying AuthHero assets...");

  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ Source directory not found: ${sourceDir}`);
    console.error("Make sure the authhero package is installed.");
    process.exit(1);
  }

  // Clean target directory to remove stale files from previous builds
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true });
    console.log("🧹 Cleaned old assets");
  }

  copyDirectory(sourceDir, targetDir);

  // Also copy widget files from @authhero/widget package
  const widgetSourceDir = path.join(
    __dirname,
    "node_modules",
    "@authhero",
    "widget",
    "dist",
    "authhero-widget",
  );
  const widgetTargetDir = path.join(targetDir, "u", "widget");

  if (fs.existsSync(widgetSourceDir)) {
    console.log("📦 Copying widget assets...");
    copyDirectory(widgetSourceDir, widgetTargetDir);
  } else {
    console.warn(`⚠️  Widget directory not found: ${widgetSourceDir}`);
    console.warn("Widget features may not work. Install @authhero/widget to enable.");
  }

  console.log(`✅ Assets copied to ${targetDir}`);
} catch (error) {
  console.error("❌ Error copying assets:", error.message);
  process.exit(1);
}
