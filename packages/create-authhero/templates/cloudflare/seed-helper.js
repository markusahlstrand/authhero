#!/usr/bin/env node

/**
 * Helper script to seed the Cloudflare D1 database
 * This script starts the seed worker, makes a request to it, and then stops it
 */

import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

const adminUsername = process.argv[2] || process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.argv[3] || process.env.ADMIN_PASSWORD || "admin";
const mode = process.argv[4] || "local";

console.log(`Starting seed worker in ${mode} mode...`);

const wranglerArgs = ["dev", "src/seed.ts"];
if (mode === "remote") {
  wranglerArgs.push("--remote");
}

const worker = spawn("wrangler", wranglerArgs, {
  stdio: ["inherit", "pipe", "inherit"],
});

let workerUrl = "http://localhost:8787";
let workerReady = false;

// Listen for the worker output to get the URL
worker.stdout?.on("data", (data) => {
  const output = data.toString();
  process.stdout.write(output);

  // Look for the URL in the output
  const urlMatch = output.match(/http:\/\/[^\s]+/);
  if (urlMatch) {
    workerUrl = urlMatch[0].replace(/\/$/, ""); // Remove trailing slash
  }

  // Detect when the worker is ready
  if (output.includes("Ready on") || output.includes("Listening on")) {
    workerReady = true;
  }
});

// Function to wait for worker to be ready with retries
async function waitForWorker(maxAttempts = 30, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Just check if the server responds (even with an error is fine)
      const response = await fetch(workerUrl, {
        signal: AbortSignal.timeout(2000)
      });
      // Any response means the server is up
      return true;
    } catch (e) {
      // ECONNREFUSED means server not ready yet
      if (e.cause?.code !== 'ECONNREFUSED') {
        // Other errors might mean the server is actually responding
        return true;
      }
    }

    if (workerReady) {
      // Give it a bit more time after wrangler reports ready
      await setTimeout(500);
      return true;
    }

    await setTimeout(delayMs);
    if (i > 0 && i % 5 === 0) {
      console.log(`Still waiting for worker... (attempt ${i + 1}/${maxAttempts})`);
    }
  }
  return false;
}

console.log("Waiting for seed worker to start...");
const isReady = await waitForWorker();

if (!isReady) {
  console.error("\n❌ Seed worker failed to start within timeout");
  worker.kill();
  process.exit(1);
}

console.log(`\nMaking seed request to ${workerUrl}...`);

try {
  const url = `${workerUrl}/?username=${encodeURIComponent(adminUsername)}&password=${encodeURIComponent(adminPassword)}`;

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
