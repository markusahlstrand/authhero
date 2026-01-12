#!/usr/bin/env node

/**
 * Copy AuthHero widget assets for Lambda deployment
 *
 * This script copies widget assets from node_modules to dist/assets
 * so they can be uploaded to S3 and served via CloudFront.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

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

// Source and destination paths
const authHeroAssets = path.join(__dirname, "node_modules/authhero/dist/assets");
const widgetSource = path.join(
  __dirname,
  "node_modules/@authhero/widget/dist/authhero-widget"
);
const targetDir = path.join(__dirname, "dist/assets");
const widgetTarget = path.join(targetDir, "u/widget");

// Copy authhero assets
if (fs.existsSync(authHeroAssets)) {
  console.log("📦 Copying AuthHero assets...");
  copyDirectory(authHeroAssets, targetDir);
} else {
  console.log("⚠️  AuthHero assets not found at:", authHeroAssets);
}

// Copy widget from @authhero/widget package
if (fs.existsSync(widgetSource)) {
  console.log("📦 Copying widget assets...");
  copyDirectory(widgetSource, widgetTarget);
} else {
  console.log("⚠️  Widget assets not found at:", widgetSource);
}

console.log("✅ Assets copied to dist/assets");
