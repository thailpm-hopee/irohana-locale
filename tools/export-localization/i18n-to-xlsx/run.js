#!/usr/bin/env node

/**
 * i18n JSON to XLSX exporter
 *
 * Reads all locale common.json files and exports them into a single XLSX file.
 *
 * Usage:
 *   node run.js [--order <path>] [--output <filename>] --project-root=<path>
 *
 * Options:
 *   --order   Path to a text file defining key ordering (one flat key per line).
 *             Default: <script_dir>/json_key_order.txt (if it exists)
 *   --output  Output XLSX filename (placed inside the tool's output dir).
 *             Default: i18n_export.xlsx
 *
 * The generated XLSX has columns:
 *   Status | JSON Key | ja | vi | my | id | en | ne | km | mn | th | ...
 *
 * Status column values:
 *   [NEW_KEY]   — key exists in JSON but is NOT listed in json_key_order.txt
 *   [DELETED]   — key is listed in json_key_order.txt but no longer exists in any JSON
 *   [PARTIAL]   — key does NOT exist in every locale's JSON file
 *   (blank)     — normal key
 *
 * Language columns are auto-detected from locale folder names.
 * To add a new locale, just create a folder under src/i18n/locales/<code>/common.json.
 */

const PREFERRED_LANG_ORDER = ['ja', 'vi', 'my', 'id', 'en', 'ne', 'km', 'mn', 'th', 'tl'];

// ─── imports ───────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { resolveLocalesDir, resolveOutputDir } = require('../../_shared/project');

// ─── helpers ───────────────────────────────────────────────────────────────────

function flattenJson(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenJson(value, flatKey));
    } else {
      // Convert arrays and other primitives to string
      result[flatKey] = Array.isArray(value) ? JSON.stringify(value) : String(value ?? '');
    }
  }
  return result;
}

function isValidKeyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  // Reject if it looks like a header (contains spaces, or is title-cased prose)
  if (/\s/.test(trimmed)) return false;
  // Must look like a dot-separated path (at least one dot) or a single camelCase/snake_case word
  return /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(trimmed);
}

function parseArgs(argv) {
  const args = { order: null, output: 'i18n_export.xlsx' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--order' && argv[i + 1]) {
      args.order = argv[++i];
    } else if (argv[i] === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    }
  }
  return args;
}

// ─── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const scriptDir = __dirname;
  const args = parseArgs(process.argv);

  // Resolve order file: explicit arg > default file in script dir
  let orderFilePath = args.order;
  if (!orderFilePath) {
    const defaultOrderFile = path.join(scriptDir, 'json_key_order.txt');
    if (fs.existsSync(defaultOrderFile)) {
      orderFilePath = defaultOrderFile;
    }
  }

  // Output goes to the shared tool output dir
  const outputDir = resolveOutputDir('export-localization');
  const outputPath = path.join(outputDir, args.output);

  // Locales directory comes from the resolved project root
  const localesDir = resolveLocalesDir();

  if (!fs.existsSync(localesDir)) {
    console.error(`Error: Locales directory not found at ${localesDir}`);
    process.exit(1);
  }

  // ── 1. Discover locales and read JSON ────────────────────────────────────

  const localeFolders = fs
    .readdirSync(localesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const localeData = {}; // { locale: { flatKey: value } }
  for (const locale of localeFolders) {
    const filePath = path.join(localesDir, locale, 'common.json');
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: ${filePath} not found, skipping locale "${locale}"`);
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    localeData[locale] = flattenJson(raw);
  }

  const availableLocales = Object.keys(localeData);
  if (availableLocales.length === 0) {
    console.error('Error: No locale JSON files found.');
    process.exit(1);
  }

  // ── 2. Build ordered language columns ────────────────────────────────────

  const langColumns = [
    ...PREFERRED_LANG_ORDER.filter((l) => availableLocales.includes(l)),
    ...availableLocales.filter((l) => !PREFERRED_LANG_ORDER.includes(l)).sort(),
  ];

  // ── 3. Collect all flat keys (union across locales) ──────────────────────

  const allKeysSet = new Set();
  for (const data of Object.values(localeData)) {
    for (const key of Object.keys(data)) {
      allKeysSet.add(key);
    }
  }
  const allKeys = [...allKeysSet];

  // ── 4. Parse key order file (if provided) ────────────────────────────────

  let orderedKeys = [];
  const orderedKeysSet = new Set();

  if (orderFilePath) {
    if (!fs.existsSync(orderFilePath)) {
      console.error(`Error: Order file not found at ${orderFilePath}`);
      process.exit(1);
    }
    const lines = fs.readFileSync(orderFilePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!isValidKeyLine(trimmed)) {
        // Skip header or invalid lines
        continue;
      }
      orderedKeys.push(trimmed);
      orderedKeysSet.add(trimmed);
    }
    console.log(`Loaded ${orderedKeys.length} keys from order file: ${orderFilePath}`);
  }

  // ── 5. Determine final key order ─────────────────────────────────────────

  const existingOrderedKeys = orderedKeys.filter((k) => allKeysSet.has(k));
  const newKeys = allKeys.filter((k) => !orderedKeysSet.has(k)).sort();
  const deletedKeys = orderedKeys.filter((k) => !allKeysSet.has(k));
  const deletedKeysSet = new Set(deletedKeys);

  const finalKeys = [...orderedKeys, ...newKeys];

  if (deletedKeys.length > 0) {
    console.warn(
      `Note: ${deletedKeys.length} key(s) from order file no longer exist in any JSON (marked [DELETED]):`,
    );
    deletedKeys.forEach((k) => console.warn(`  - ${k}`));
  }

  // ── 6. Determine status for each key ─────────────────────────────────────

  const totalLocales = availableLocales.length;

  function getKeyStatus(key) {
    if (deletedKeysSet.has(key)) return '[DELETED]';

    const isNewKey = orderFilePath && !orderedKeysSet.has(key);
    const presentCount = availableLocales.filter((l) => localeData[l][key] !== undefined).length;
    const isPartial = presentCount < totalLocales;

    const statuses = [];
    if (isNewKey) statuses.push('[NEW_KEY]');
    if (isPartial) statuses.push('[PARTIAL]');
    return statuses.join(' ');
  }

  // ── 7. Build XLSX ────────────────────────────────────────────────────────

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('i18n');

  const columns = [
    { header: 'Status', key: 'status', width: 15 },
    { header: 'JSON Key', key: 'key', width: 45 },
    ...langColumns.map((lang) => ({ header: lang, key: lang, width: 30 })),
  ];
  sheet.columns = columns;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

  const NEW_KEY_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  const PARTIAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
  const NEW_KEY_PARTIAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCBC' } };
  const DELETED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  const STATUS_FONT_NEW = { color: { argb: 'FFE65100' }, bold: true };
  const STATUS_FONT_PARTIAL = { color: { argb: 'FFC62828' }, bold: true };
  const DELETED_FONT = { color: { argb: 'FF757575' }, bold: true, strike: true };

  for (const key of finalKeys) {
    const status = getKeyStatus(key);
    const rowData = { status, key };
    for (const lang of langColumns) {
      rowData[lang] = localeData[lang]?.[key] ?? '';
    }

    const row = sheet.addRow(rowData);
    const isDeleted = status.includes('[DELETED]');

    if (isDeleted) {
      row.eachCell((cell) => {
        cell.fill = DELETED_FILL;
        cell.font = DELETED_FONT;
      });
    } else if (status.includes('[NEW_KEY]') && status.includes('[PARTIAL]')) {
      row.eachCell((cell) => {
        cell.fill = NEW_KEY_PARTIAL_FILL;
      });
      row.getCell('status').font = STATUS_FONT_NEW;
    } else if (status.includes('[NEW_KEY]')) {
      row.eachCell((cell) => {
        cell.fill = NEW_KEY_FILL;
      });
      row.getCell('status').font = STATUS_FONT_NEW;
    } else if (status.includes('[PARTIAL]')) {
      row.eachCell((cell) => {
        cell.fill = PARTIAL_FILL;
      });
      row.getCell('status').font = STATUS_FONT_PARTIAL;
    }

    if (!isDeleted) {
      for (const lang of langColumns) {
        const cell = row.getCell(lang);
        if (!cell.value) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF8A80' },
          };
        }
      }
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: finalKeys.length + 1, column: columns.length },
  };

  const borderStyle = { style: 'thin', color: { argb: 'FFD0D0D0' } };
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: borderStyle,
        left: borderStyle,
        bottom: borderStyle,
        right: borderStyle,
      };
      if (!cell.alignment) {
        cell.alignment = { vertical: 'top', wrapText: true };
      }
    });
  });

  // ── 8. Write file ────────────────────────────────────────────────────────

  await workbook.xlsx.writeFile(outputPath);

  console.log(`\nExported ${finalKeys.length} keys × ${langColumns.length} languages`);
  console.log(`  Languages: ${langColumns.join(', ')}`);
  if (orderFilePath) {
    console.log(`  Ordered keys: ${existingOrderedKeys.length}`);
    console.log(`  New keys (not in order file): ${newKeys.length}`);
    console.log(`  Deleted keys (in order file, removed from JSON): ${deletedKeys.length}`);
  }
  console.log(`\nOutput: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
