#!/usr/bin/env node

/**
 * Script 2: Update locale files from diff-updates.json (output b)
 *
 * Reads the JSON produced by parse-translations.js (b),
 * updates the nested locale JSON files in <projectRoot>/src/i18n/locales/,
 * and generates a markdown report with status for each key.
 *
 * Usage:
 *   node update-locales.js [path-to-diff-updates.json] --project-root=<path>
 *   node update-locales.js  (defaults to <outputDir>/diff-updates.json)
 */

const path = require('path');
const fs = require('fs');
const { resolveLocalesDir, resolveOutputDir } = require('../_shared/project');

// ---------------------------------------------------------------------------
// Config (project paths come from the TUI / --project-root, not __dirname)
// ---------------------------------------------------------------------------

const OUTPUT_DIR = resolveOutputDir('i18n-update');
const DEFAULT_INPUT = path.join(OUTPUT_DIR, 'diff-updates.json');
const LOCALES_DIR = resolveLocalesDir();
const REPORT_PATH = path.join(OUTPUT_DIR, 'update-report.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a nested value from an object using dot-notation key.
 * Returns undefined if path does not exist.
 */
function getNestedValue(obj, dotKey) {
  const parts = dotKey.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/** Structural equality good enough for JSON translation values. */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Set a nested value in an object using dot-notation key.
 * Creates intermediate objects if they don't exist.
 */
function setNestedValue(obj, dotKey, value) {
  const parts = dotKey.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // First non-flag arg is an optional path to diff-updates.json.
  const inputPath = process.argv.slice(2).find((a) => !a.startsWith('--')) || DEFAULT_INPUT;

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    console.error('   Run parse-translations.js first to generate it.');
    process.exit(1);
  }

  console.log(`📖 Reading updates from: ${inputPath}`);

  const updates = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const languages = Object.keys(updates);

  if (languages.length === 0) {
    console.log('✅ No updates to apply.');
    return;
  }

  const reportLines = [
    '# i18n Locale Update Report',
    '',
    `> Generated: ${new Date().toISOString()}`,
    '',
  ];

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const lang of languages) {
    const localeFile = path.join(LOCALES_DIR, lang, 'common.json');
    const langUpdates = updates[lang];
    const keys = Object.keys(langUpdates);

    reportLines.push(`## ${lang} (${keys.length} key(s))`);
    reportLines.push('');
    reportLines.push('| Status | Key | Excel Row | Note |');
    reportLines.push('|--------|-----|-----------|------|');

    if (!fs.existsSync(localeFile)) {
      console.warn(`⚠️  Locale file not found: ${localeFile}`);
      for (const key of keys) {
        reportLines.push(`| ❌ SKIPPED | \`${key}\` | ${langUpdates[key].excelRow} | Locale file not found |`);
        totalSkipped++;
      }
      reportLines.push('');
      continue;
    }

    // Read existing locale
    const localeData = JSON.parse(fs.readFileSync(localeFile, 'utf-8'));

    for (const key of keys) {
      const { value, excelRow, isNewKey } = langUpdates[key];
      const existingValue = getNestedValue(localeData, key);

      if (existingValue === undefined) {
        // Key doesn't exist in locale — add it
        setNestedValue(localeData, key, value);
        const note = isNewKey ? 'New key (missing from locale)' : 'New key added';
        reportLines.push(`| ✅ ADDED | \`${key}\` | ${excelRow} | ${note} |`);
        totalUpdated++;
      } else if (valuesEqual(existingValue, value)) {
        // Already up to date
        reportLines.push(`| ⏭️ SKIPPED | \`${key}\` | ${excelRow} | Already up to date |`);
        totalSkipped++;
      } else {
        // Update existing value
        setNestedValue(localeData, key, value);
        reportLines.push(`| ✅ UPDATED | \`${key}\` | ${excelRow} | Value changed |`);
        totalUpdated++;
      }
    }

    // Write back
    fs.writeFileSync(localeFile, JSON.stringify(localeData, null, 2) + '\n', 'utf-8');
    console.log(`  ✅ ${lang}: ${keys.length} key(s) processed → ${localeFile}`);

    // Verify after writing
    const verifyData = JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
    for (const key of keys) {
      const { value } = langUpdates[key];
      const actualValue = getNestedValue(verifyData, key);
      if (!valuesEqual(actualValue, value)) {
        // Find the row in report and update status
        const rowIdx = reportLines.findLastIndex((l) => l.includes(`\`${key}\``));
        if (rowIdx !== -1) {
          reportLines[rowIdx] = reportLines[rowIdx]
            .replace('✅ UPDATED', '❌ FAILED')
            .replace('✅ ADDED', '❌ FAILED')
            .replace('Value changed', 'Verification failed')
            .replace('New key added', 'Verification failed');
          totalErrors++;
          totalUpdated--;
        }
      }
    }

    reportLines.push('');
  }

  // Summary
  reportLines.push('## Summary');
  reportLines.push('');
  reportLines.push(`| Metric | Count |`);
  reportLines.push(`|--------|-------|`);
  reportLines.push(`| Updated | ${totalUpdated} |`);
  reportLines.push(`| Skipped | ${totalSkipped} |`);
  reportLines.push(`| Errors | ${totalErrors} |`);
  reportLines.push(`| **Total** | **${totalUpdated + totalSkipped + totalErrors}** |`);
  reportLines.push('');

  // Write report
  const outputDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(REPORT_PATH, reportLines.join('\n'), 'utf-8');

  console.log(`\n✅ Update complete!`);
  console.log(`  Updated: ${totalUpdated}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);
  console.log(`  Report: ${REPORT_PATH}`);
}

if (require.main === module) {
  main();
}

module.exports = { getNestedValue, setNestedValue, valuesEqual };
