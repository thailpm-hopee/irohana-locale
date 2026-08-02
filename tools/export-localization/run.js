#!/usr/bin/env node

/**
 * Export Localization
 *
 * 2-step flow:
 *   1. i18n-to-xlsx  — JSON locale files → single XLSX
 *   2. locale-to-json — common.json → individual {lang}.json
 *
 * Then zips all outputs into localization.zip.
 *
 * Usage:
 *   node run.js --project-root=<path>
 */

const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { execFileSync } = require('child_process');
const { resolveProjectRoot, resolveOutputDir } = require('../_shared/project');

const SCRIPT_DIR = __dirname;

// Resolve context once and export to the environment so both sub-scripts agree
// on the project root + output dir (whether invoked via the TUI or --project-root).
const PROJECT_ROOT = resolveProjectRoot();
const OUTPUT_DIR = resolveOutputDir('export-localization');
process.env.IRL_PROJECT_ROOT = PROJECT_ROOT;
process.env.IRL_OUTPUT_DIR = OUTPUT_DIR;

const ZIP_FILE = path.join(OUTPUT_DIR, 'localization.zip');
const XLSX_FILE = path.join(OUTPUT_DIR, 'i18n_export.xlsx');
const JSON_DIR = path.join(OUTPUT_DIR, 'json');

function log(msg = '') {
  console.log(msg);
}

function runSubScript(label, scriptPath) {
  log(`=== ${label} ===`);
  log(`  Script: ${scriptPath}`);
  try {
    execFileSync('node', [scriptPath], { stdio: 'inherit' });
  } catch (err) {
    console.error(`\n❌ Bước "${label}" thất bại (mã lỗi ${err.status ?? 1}). Dừng quy trình.`);
    process.exit(err.status || 1);
  }
}

/** Zip the xlsx file (at the root of the archive) and every generated JSON. */
function createZip(destPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    if (fs.existsSync(XLSX_FILE)) {
      archive.file(XLSX_FILE, { name: path.basename(XLSX_FILE) });
    }
    if (fs.existsSync(JSON_DIR)) {
      const jsonFiles = fs.readdirSync(JSON_DIR).filter((f) => f.endsWith('.json'));
      for (const file of jsonFiles) {
        archive.file(path.join(JSON_DIR, file), { name: file });
      }
    }
    archive.finalize();
  });
}

async function main() {
  log(`Project root: ${PROJECT_ROOT}`);
  log(`Output dir:   ${OUTPUT_DIR}`);
  log();

  // Clean previous output for a fresh export
  if (fs.existsSync(ZIP_FILE)) fs.unlinkSync(ZIP_FILE);
  if (fs.existsSync(XLSX_FILE)) fs.unlinkSync(XLSX_FILE);
  fs.rmSync(JSON_DIR, { recursive: true, force: true });

  // Step 1: i18n-to-xlsx
  const xlsxScript = path.join(SCRIPT_DIR, 'i18n-to-xlsx', 'run.js');
  runSubScript('Step 1/2: i18n-to-xlsx', xlsxScript);
  log(`  Output: ${XLSX_FILE}`);
  log();

  // Step 2: locale-to-json
  const jsonScript = path.join(SCRIPT_DIR, 'locale-to-json', 'run.js');
  runSubScript('Step 2/2: locale-to-json', jsonScript);
  log(`  Output: ${JSON_DIR}/`);
  log();

  // Zip
  log('=== Creating localization.zip ===');
  await createZip(ZIP_FILE);

  log();
  log('============================================');
  log('  Done!');
  log(`  Zip:    ${ZIP_FILE}`);
  log(`  XLSX:   ${XLSX_FILE}`);
  log(`  JSON:   ${JSON_DIR}/`);
  log('============================================');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
