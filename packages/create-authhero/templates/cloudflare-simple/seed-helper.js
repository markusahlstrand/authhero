#!/usr/bin/env node

/**
 * Helper script to seed the Cloudflare D1 database
 * This script starts the seed worker, makes a request to it, and then stops it
 */

import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

const adminEmail = process.argv[2] || process.env.ADMIN_EMAIL;
const adminPassword = process.argv[3] || process.env.ADMIN_PASSWORD;
const mode = process.argv[4] || "local";

if (!adminEmail || !adminPassword) {
  console.error("Usage: node seed-helper.js <email> <password> [local|remote]");
  console.error(
    "   or: ADMIN_EMAIL=... ADMIN_PASSWORD=... node seed-helper.js",
  );
  process.exit(1);
}

console.log(`Starting seed worker in ${mode} mode...`);

const wranglerArgs = ["dev", "src/seed.ts"];
if (mode === "remote") {
  wranglerArgs.push("--remote");
}

const worker = spawn("wrangler", wranglerArgs, {
  stdio: ["inherit", "pipe", "inherit"],
});

let workerUrl = "http://localhost:8787";

// Listen for the worker output to get the URL
worker.stdout?.on("data", (data) => {
  const output = data.toString();
  process.stdout.write(output);

  // Look for the URL in the output
  const urlMatch = output.match(/http:\/\/[^\s]+/);
  if (urlMatch) {
    workerUrl = urlMatch[0].replace(/\/$/, ""); // Remove trailing slash
  }
});

// Wait for the worker to start
await setTimeout(3000);

console.log(`\nMaking seed request to ${workerUrl}...`);

try {
  const url = `${workerUrl}/?email=${encodeURIComponent(adminEmail)}&password=${encodeURIComponent(adminPassword)}`;

  const response = await fetch(url);
  const result = await response.json();

  if (response.ok) {
    console.log("\n✅ Seed completed successfully!");
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error("\n❌ Seed failed:");
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
} catch (error) {
  console.error("\n❌ Failed to connect to seed worker:");
  console.error(error);
  process.exit(1);
} finally {
  // Stop the worker
  console.log("\nStopping seed worker...");
  worker.kill();
}
