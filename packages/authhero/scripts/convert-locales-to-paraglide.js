/**
 * Script to convert i18next locale files to Paraglide format
 * 
 * Converts {{variable}} to {variable} syntax
 * Run with: node scripts/convert-locales-to-paraglide.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.join(__dirname, '..');

const localesDir = path.join(packageDir, 'src/locales');
const outputDir = path.join(packageDir, 'messages');

const locales = ['en', 'nb', 'sv', 'da', 'fi', 'cs', 'pl', 'it'];

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function convertI18nextToParaglide(value) {
  if (typeof value !== 'string') return value;
  
  // Convert {{variable}} to {variable}
  // Also handle rich text tags like <0>content</0> - we'll preserve these as-is for now
  // Paraglide doesn't have built-in rich text, but we can handle it with string interpolation
  return value.replace(/\{\{(\w+)\}\}/g, '{$1}');
}

for (const locale of locales) {
  const inputPath = path.join(localesDir, locale, 'default.json');
  const outputPath = path.join(outputDir, `${locale}.json`);
  
  if (!fs.existsSync(inputPath)) {
    console.log(`Skipping ${locale}: ${inputPath} not found`);
    continue;
  }
  
  const content = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const converted = {};
  
  for (const [key, value] of Object.entries(content)) {
    // Convert key to valid identifier (replace - with _)
    const validKey = key.replace(/-/g, '_');
    converted[validKey] = convertI18nextToParaglide(value);
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(converted, null, 2) + '\n');
  console.log(`Converted ${locale}: ${Object.keys(converted).length} messages`);
}

console.log('\nDone! Messages written to:', outputDir);
