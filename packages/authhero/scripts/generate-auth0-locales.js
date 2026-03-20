const fs = require("fs");
const path = require("path");

/**
 * Generates Paraglide flat message files from Auth0-format nested locale JSON files.
 * Also copies Auth0-format files to dist/locales/ for runtime use.
 *
 * Source:  locales/{locale}.json   (nested prompt → screen → key, Auth0 format)
 * Output:  messages/{locale}.json  (flat key-value, Paraglide format)
 *          dist/locales/{locale}.json (copy of source for API runtime)
 *
 * Deterministic key naming convention:
 *   - When screen === prompt: {prompt_snake}__{key_snake}
 *     e.g., login-id.login-id.footerText → login_id__footer_text
 *   - When screen !== prompt: {prompt_snake}__{screen_snake}__{key_snake}
 *     e.g., email-otp-challenge.sms-otp-challenge.title → email_otp_challenge__sms_otp_challenge__title
 */

const LOCALES_DIR = path.resolve(__dirname, "../locales");
const MESSAGES_DIR = path.resolve(__dirname, "../messages");
const DIST_LOCALES_DIR = path.resolve(__dirname, "../dist/locales");

/**
 * Convert a camelCase or kebab-case key to snake_case.
 * Examples:
 *   footerText → footer_text
 *   federatedConnectionButtonText → federated_connection_button_text
 *   no-email → no_email
 *   invalid-email-format → invalid_email_format
 */
function toSnakeCase(key) {
  return key
    .replace(/([A-Z])/g, "_$1")
    .replace(/-/g, "_")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Convert a prompt/screen ID (kebab-case) to snake_case.
 * Examples:
 *   login-id → login_id
 *   email-otp-challenge → email_otp_challenge
 */
function idToSnake(id) {
  return id.replace(/-/g, "_");
}

/**
 * Build a deterministic Paraglide key from prompt, screen, and Auth0 key.
 */
function toParaglideKey(prompt, screen, key) {
  const promptSnake = idToSnake(prompt);
  const keySnake = toSnakeCase(key);

  if (screen === prompt) {
    return `${promptSnake}__${keySnake}`;
  }

  const screenSnake = idToSnake(screen);
  return `${promptSnake}__${screenSnake}__${keySnake}`;
}

/**
 * Convert Auth0 placeholder syntax ${var} to Paraglide syntax {var}.
 * Also handles #{var} → {var}.
 */
function convertPlaceholdersToParaGlide(value) {
  return value
    .replace(/\$\{(\w+)\}/g, "{$1}")
    .replace(/#\{(\w+)\}/g, "{$1}");
}

function generate() {
  // Ensure output directories exist
  for (const dir of [MESSAGES_DIR, DIST_LOCALES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const localeFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter((f) => f.endsWith(".json"));

  for (const file of localeFiles) {
    const locale = path.basename(file, ".json");
    const auth0Data = JSON.parse(
      fs.readFileSync(path.join(LOCALES_DIR, file), "utf-8"),
    );

    // Generate flat Paraglide messages
    const messages = {};

    for (const [prompt, screens] of Object.entries(auth0Data)) {
      for (const [screen, keys] of Object.entries(screens)) {
        for (const [key, value] of Object.entries(keys)) {
          const paraglideKey = toParaglideKey(prompt, screen, key);
          messages[paraglideKey] = convertPlaceholdersToParaGlide(value);
        }
      }
    }

    // Sort keys for consistent output
    const sorted = {};
    for (const key of Object.keys(messages).sort()) {
      sorted[key] = messages[key];
    }

    // Write Paraglide messages
    const messagesPath = path.join(MESSAGES_DIR, `${locale}.json`);
    fs.writeFileSync(messagesPath, JSON.stringify(sorted, null, 2) + "\n");

    // Copy Auth0-format file to dist
    const distPath = path.join(DIST_LOCALES_DIR, `${locale}.json`);
    fs.copyFileSync(path.join(LOCALES_DIR, file), distPath);

    console.log(
      `  ${locale}: ${Object.keys(sorted).length} Paraglide keys generated`,
    );
  }

  console.log(
    `\nGenerated ${localeFiles.length} locale files in ${MESSAGES_DIR} and ${DIST_LOCALES_DIR}`,
  );
}

generate();
