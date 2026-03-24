#!/usr/bin/env node
/**
 * Generate TypeScript interfaces from locales/en.json
 *
 * Reads the English locale file (source of truth) and generates:
 * - A typed interface per screen with method signatures
 * - Variable names extracted from ${var}, #{var}, {var} placeholders
 * - A ScreenMap mapping type for createTranslation generics
 *
 * Run: node scripts/generate-locale-types.js
 */

const fs = require("fs");
const path = require("path");

const LOCALE_DIR = path.resolve(__dirname, "../locales");
const OUTPUT_FILE = path.resolve(__dirname, "../src/generated/locale-types.ts");

// Read English locale as source of truth
const enPath = path.join(LOCALE_DIR, "en.json");
const enData = JSON.parse(fs.readFileSync(enPath, "utf-8"));

// Discover available locales
const locales = fs
  .readdirSync(LOCALE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""))
  .sort();

/**
 * Extract variable names from a translation string.
 * Handles ${var}, #{var}, and {var} syntax.
 */
function extractVariables(text) {
  const vars = new Set();
  const patterns = [
    /\$\{(\w+)\}/g, // ${var}
    /#\{(\w+)\}/g, // #{var}
    /\{(\w+)\}/g, // {var} (but not after $ or #)
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      vars.add(match[1]);
    }
  }
  return [...vars].sort();
}

/**
 * Convert a prompt.screen key to a PascalCase interface name.
 * e.g., "login-id.login-id" → "LoginIdScreen"
 *        "email-otp-challenge.email-otp-challenge" → "EmailOtpChallengeScreen"
 *        "email-otp-challenge.sms-otp-challenge" → "EmailOtpChallengeSmsOtpChallengeScreen"
 */
function toInterfaceName(prompt, screen) {
  const toPascal = (s) =>
    s
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");

  // If prompt === screen, just use one
  if (prompt === screen) {
    return `${toPascal(prompt)}Screen`;
  }
  return `${toPascal(prompt)}${toPascal(screen)}Screen`;
}

/**
 * Check if a key is a valid JS identifier (can use dot access).
 */
function isValidIdentifier(key) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key);
}

// Collect all interfaces and the screen map
const interfaces = [];
const screenMapEntries = [];

for (const [prompt, screens] of Object.entries(enData)) {
  for (const [screen, translations] of Object.entries(screens)) {
    const interfaceName = toInterfaceName(prompt, screen);
    const methods = [];

    for (const [key, value] of Object.entries(translations)) {
      const vars = extractVariables(value);
      const quotedKey = isValidIdentifier(key) ? key : `"${key}"`;

      if (vars.length > 0) {
        const varType = vars.map((v) => `${v}: string`).join("; ");
        methods.push(`  ${quotedKey}: (vars: { ${varType} }) => string;`);
      } else {
        methods.push(`  ${quotedKey}: () => string;`);
      }
    }

    interfaces.push(
      `export interface ${interfaceName} {\n${methods.join("\n")}\n}`,
    );

    screenMapEntries.push(`  "${prompt}.${screen}": ${interfaceName};`);
  }
}

// Build output
const output = `// Auto-generated from locales/en.json — do not edit manually
// Run: pnpm build:i18n

export type Locale = ${locales.map((l) => `"${l}"`).join(" | ")};

${interfaces.join("\n\n")}

export interface ScreenMap {
${screenMapEntries.join("\n")}
}
`;

// Ensure output directory exists
const outDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(OUTPUT_FILE, output, "utf-8");
console.log(
  `Generated ${interfaces.length} screen interfaces → ${path.relative(process.cwd(), OUTPUT_FILE)}`,
);
