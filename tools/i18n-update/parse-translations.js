#!/usr/bin/env node

/**
 * Script 1: Parse Excel translation file
 *
 * Reads the first sheet of the Excel file, compares "Current" vs "Updated" columns
 * for each language, and also checks locale JSON files for missing keys.
 *
 * Outputs two JSON files:
 *   (a) diff-full.json               — keys with both old + new values, plus Excel row number
 *   (b) diff-updates.json            — keys with only new values, plus Excel row number
 *   (c) i18n-transformed-check.md    — markdown report of values transformed during parsing
 *   (d) i18n-transformed-check.xlsx  — same report as Excel (one sheet per language)
 *
 * Detection logic depends on --layout:
 *   - paired: Updated column not empty AND differs from Current → update;
 *             key missing from locale JSON → new key (isNewKey: true).
 *   - single: the single per-language column IS the desired value; compared
 *             against the locale JSON (the source of truth).
 *   - multi:  each language has one or more columns (detected from the header),
 *             possibly a different count per language. The rightmost reviewed
 *             cell wins and is compared against the locale JSON.
 *
 * Usage:
 *   node parse-translations.js <path-to-excel> --project-root=<path> [--layout=paired|single|multi]
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { getStrikethroughRefs, columnLetter } = require('./read-strikethrough');
const { resolveLocalesDir, resolveOutputDir } = require('../_shared/project');

// ---------------------------------------------------------------------------
// Config (project paths come from the TUI / --project-root, not __dirname)
// ---------------------------------------------------------------------------

const OUTPUT_DIR = resolveOutputDir('i18n-update');
const LOCALES_DIR = resolveLocalesDir();

// Column mapping: language code → [currentColIndex, updatedColIndex]
// Based on header row structure (0-indexed):
//   A(0)=Key, B(1)=Image, C(2)=ja current, D(3)=ja updated, ...
const LANG_COLUMNS = {
  ja: { current: 2, updated: 3 },
  vi: { current: 4, updated: 5 },
  my: { current: 6, updated: 7 },
  id: { current: 8, updated: 9 },
  en: { current: 10, updated: 11 },
  ne: { current: 12, updated: 13 },
  km: { current: 14, updated: 15 },
  mn: { current: 16, updated: 17 },
  th: { current: 18, updated: 19 },
  tl: { current: 20, updated: 21 },
};

// Known language codes (single source of truth derived from LANG_COLUMNS).
const LANG_CODES = Object.keys(LANG_COLUMNS);

/**
 * Parse CLI args: an optional Excel path (first non-flag arg) and an optional
 * `--layout=single|paired` flag (defaults to `paired`, the legacy two-column
 * layout with a "current" + "updated" column per language).
 */
function parseArgs(argv) {
  let excelPath = null;
  let layout = 'paired';
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--layout=')) {
      layout = arg.slice('--layout='.length);
    } else if (!arg.startsWith('--')) {
      excelPath = arg;
    }
  }
  return { excelPath, layout };
}

/**
 * Build a { langCode → columnIndex } map for the single-column layout by
 * inspecting the header row. A header cell is treated as a language column when
 * it starts with a known language code followed by "(" — e.g. "ja (2026-07-26)".
 * The "JSON Key" and reference (テキストの場所) columns are ignored.
 */
function buildSingleColumnMap(headerRow) {
  const map = {};
  for (let c = 0; c < headerRow.length; c++) {
    const header = String(headerRow[c] || '').trim();
    const match = header.match(/^([a-z]{2,3})\s*[(（]/i);
    if (!match) continue;
    const code = match[1].toLowerCase();
    if (LANG_CODES.includes(code) && !(code in map)) {
      map[code] = c;
    }
  }
  return map;
}

/**
 * Build a { langCode → [columnIndex, …] } map for the multi-column layout.
 * Same header detection as buildSingleColumnMap, but keeps EVERY column that
 * belongs to a language (left→right order preserved) instead of only the first.
 * This lets a language carry any number of columns (e.g. a baseline plus one or
 * more revision rounds), and lets different languages have different counts.
 * The chosen value per row is resolved later as the rightmost reviewed cell.
 */
function buildMultiColumnMap(headerRow) {
  const map = {};
  for (let c = 0; c < headerRow.length; c++) {
    const header = String(headerRow[c] || '').trim();
    const match = header.match(/^([a-z]{2,3})\s*[(（]/i);
    if (!match) continue;
    const code = match[1].toLowerCase();
    if (!LANG_CODES.includes(code)) continue;
    if (!map[code]) map[code] = [];
    map[code].push(c);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a nested value from an object using dot-notation key.
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

// ---------------------------------------------------------------------------
// Transformation detection
// ---------------------------------------------------------------------------

/**
 * Transformation type codes with Vietnamese descriptions.
 */
const TRANSFORM_TYPES = {
  TRIM_LEADING_SPACE: {
    code: 'T01',
    description: 'Văn bản có khoảng trắng thừa ở đầu câu',
  },
  TRIM_TRAILING_SPACE: {
    code: 'T02',
    description: 'Văn bản có khoảng trắng thừa ở cuối câu',
  },
  TRIM_LEADING_NEWLINE: {
    code: 'T03',
    description: 'Văn bản có ký tự xuống dòng ở đầu câu',
  },
  TRIM_TRAILING_NEWLINE: {
    code: 'T04',
    description: 'Văn bản có ký tự xuống dòng ở cuối câu',
  },
  TRIM_LEADING_TAB: {
    code: 'T05',
    description: 'Văn bản có ký tự tab ở đầu câu',
  },
  TRIM_TRAILING_TAB: {
    code: 'T06',
    description: 'Văn bản có ký tự tab ở cuối câu',
  },
  TRIM_LEADING_CR: {
    code: 'T07',
    description: 'Văn bản có ký tự xuống dòng kiểu Windows (⏎) ở đầu câu',
  },
  TRIM_TRAILING_CR: {
    code: 'T08',
    description: 'Văn bản có ký tự xuống dòng kiểu Windows (⏎) ở cuối câu',
  },
  COLLAPSE_DOUBLE_SPACE: {
    code: 'T09',
    description: 'Văn bản có khoảng trắng kép bên trong nội dung — đã gộp thành 1 dấu cách',
  },
  TRIM_SPACE_BEFORE_PAREN: {
    code: 'T10',
    description: 'Văn bản có khoảng trắng thừa trước dấu ")" — đã xóa',
  },
  NEWLINE_INSIDE: {
    code: 'W01',
    description: 'Văn bản có ký tự xuống dòng bên trong nội dung',
  },
  TAB_INSIDE: {
    code: 'W02',
    description: 'Văn bản có ký tự tab bên trong nội dung',
  },
};

/**
 * Detect trim transformations applied to a raw value.
 * Returns an array of transform type keys.
 */
function detectTrimTransformations(rawValue, trimmedValue) {
  if (rawValue === trimmedValue) return [];

  const transforms = [];
  const leading = rawValue.substring(0, rawValue.length - rawValue.trimStart().length);
  const trailing = rawValue.substring(rawValue.trimEnd().length);

  // Check leading characters
  if (/\n/.test(leading)) transforms.push('TRIM_LEADING_NEWLINE');
  if (/\r/.test(leading)) transforms.push('TRIM_LEADING_CR');
  if (/\t/.test(leading)) transforms.push('TRIM_LEADING_TAB');
  if (/[^\S\n\r\t]/.test(leading)) transforms.push('TRIM_LEADING_SPACE');

  // Check trailing characters
  if (/\n/.test(trailing)) transforms.push('TRIM_TRAILING_NEWLINE');
  if (/\r/.test(trailing)) transforms.push('TRIM_TRAILING_CR');
  if (/\t/.test(trailing)) transforms.push('TRIM_TRAILING_TAB');
  if (/[^\S\n\r\t]/.test(trailing)) transforms.push('TRIM_TRAILING_SPACE');

  return transforms;
}

/**
 * Sanitize a value beyond simple trim:
 *  - Collapse multiple spaces into one
 *  - Remove spaces before closing parenthesis: ` )` → `)`
 */
function sanitizeValue(value) {
  return value
    .trim()
    .replace(/ {2,}/g, ' ')
    .replace(/ +\)/g, ')');
}

/**
 * Detect content-level transforms and warnings inside the text.
 * Checks the trimmed value so we only look at the actual content.
 */
function detectContentIssues(trimmedValue) {
  const issues = [];

  // Transforms (value will be changed)
  if (/ {2,}/.test(trimmedValue)) issues.push('COLLAPSE_DOUBLE_SPACE');
  if (/ +\)/.test(trimmedValue)) issues.push('TRIM_SPACE_BEFORE_PAREN');

  // Warnings (value NOT changed, but flagged)
  if (/\n/.test(trimmedValue)) issues.push('NEWLINE_INSIDE');
  if (/\t/.test(trimmedValue)) issues.push('TAB_INSIDE');

  return issues;
}

/**
 * Detect all issues: trim transformations + content issues.
 */
function detectAllIssues(rawValue, sanitizedValue) {
  const trimIssues = detectTrimTransformations(rawValue, rawValue.trim());
  const contentIssues = detectContentIssues(rawValue.trim());
  return [...trimIssues, ...contentIssues];
}

/**
 * Load locale JSON data for all languages (cached).
 */
function loadLocaleData() {
  const data = {};
  for (const lang of Object.keys(LANG_COLUMNS)) {
    const filePath = path.join(LOCALES_DIR, lang, 'common.json');
    if (fs.existsSync(filePath)) {
      data[lang] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
      data[lang] = null;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Value typing
// ---------------------------------------------------------------------------

/** Structural equality good enough for JSON translation values. */
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Excel cells are always text, so a structured value like
 * `dayLabels: ["月","火",...]` arrives as the string '["月","火",...]'. Writing
 * that back verbatim would clobber the array with a string and break code that
 * reads it via i18next `returnObjects: true`.
 *
 * This coerces such a cell into its real value when either the existing locale
 * value is structured (array/object) or the text itself looks like JSON.
 * Returns { value, isStructured }:
 *   - isStructured=true  → value is a parsed array/object; skip text sanitizing
 *   - isStructured=false → value is a normal (sanitized) string
 */
function coerceCellValue(rawValue, existingValue) {
  const trimmed = rawValue.trim();
  const existingIsStructured = existingValue !== null && typeof existingValue === 'object';
  const looksStructured = /^[[{][\s\S]*[\]}]$/.test(trimmed);

  if (existingIsStructured || looksStructured) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') {
        return { value: parsed, isStructured: true };
      }
    } catch {
      // Not valid JSON — fall through and treat it as a plain string.
    }
  }
  return { value: sanitizeValue(rawValue), isStructured: false };
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/**
 * Compare the Excel rows against locale JSON and build the diff structures.
 * Supports two layouts:
 *   - 'paired': each language has a "current" + "updated" column pair. A key is
 *     flagged when Updated is non-empty and differs from Current, or when the
 *     value is missing from the locale file.
 *   - 'single': each language has a single column holding the desired value.
 *     A key is flagged when that value differs from (or is missing in) the
 *     locale file.
 *
 * Returns { diffFull, diffUpdates, transformedRecords, totalChanges, totalNewKeys }.
 */
function detectChanges({ rows, localeData, layout, singleColMap, multiColMap, strikeRefs }) {
  const diffFull = {};   // (a) with old + new
  const diffUpdates = {}; // (b) with only new
  // transformedRecords: { [lang]: [{ key, excelRow, column, rawValue, finalValue, issues }] }
  const transformedRecords = {};

  const struck = strikeRefs || new Set();
  const skippedDeletedRows = []; // keys skipped because the row is struck through

  let totalChanges = 0;
  let totalNewKeys = 0;

  // Track transformations and content warnings on a value being written.
  function recordIssues(lang, key, excelRow, rawValue, finalValue, column) {
    const issues = detectAllIssues(rawValue, finalValue);
    if (issues.length > 0) {
      if (!transformedRecords[lang]) transformedRecords[lang] = [];
      transformedRecords[lang].push({ key, excelRow, column, rawValue, finalValue, issues });
    }
  }

  // Resolve a single raw cell value for a language/key against the locale JSON,
  // recording an update (or new key) when it differs. Shared by the 'single' and
  // 'multi' layouts, where the JSON — not a sibling column — is the source of
  // truth. Caller is responsible for picking which cell `rawValue` comes from.
  function recordResolvedValue(lang, key, excelRow, rawValue) {
    if (localeData[lang] == null) return; // locale file doesn't exist

    const existingValue = getNestedValue(localeData[lang], key);

    // Preserve structured values (arrays/objects) instead of stringifying.
    const { value, isStructured } = coerceCellValue(rawValue, existingValue);
    if (valuesEqual(existingValue, value)) return; // already up to date

    const isNewKey = existingValue === undefined;
    if (!diffFull[lang]) diffFull[lang] = {};
    if (!diffUpdates[lang]) diffUpdates[lang] = {};

    // Text-level transform checks only apply to plain string values.
    if (!isStructured) recordIssues(lang, key, excelRow, rawValue, value, 'value');

    diffFull[lang][key] = {
      oldValue: isNewKey ? '' : existingValue,
      newValue: value,
      excelRow,
      ...(isNewKey ? { isNewKey: true } : {}),
    };
    diffUpdates[lang][key] = {
      value,
      excelRow,
      ...(isNewKey ? { isNewKey: true } : {}),
    };

    totalChanges++;
    if (isNewKey) totalNewKeys++;
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const key = String(row[0] || '').trim();
    if (!key) continue;

    const excelRow = i + 1; // 1-based row number in Excel (header=row1, data starts row2)

    // -----------------------------------------------------------------------
    // Single-column layout: cell value IS the desired translation.
    // -----------------------------------------------------------------------
    if (layout === 'single') {
      // A struck-through JSON Key cell (column A) marks a deleted key → skip
      // the whole row.
      if (struck.has(`A${excelRow}`)) {
        skippedDeletedRows.push({ key, excelRow });
        continue;
      }

      for (const [lang, colIdx] of Object.entries(singleColMap)) {
        // Skip individual struck-through language cells (partial deletions).
        if (struck.has(`${columnLetter(colIdx)}${excelRow}`)) continue;

        const rawValue = String(row[colIdx] ?? '');
        const trimmedRaw = rawValue.trim();

        // Skip empty cells and unreviewed placeholders.
        if (!trimmedRaw || trimmedRaw === '未チェック') continue;

        recordResolvedValue(lang, key, excelRow, rawValue);
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Multi-column layout: each language has one or more columns (baseline +
    // revision rounds), and languages may differ in how many. The applied value
    // is the RIGHTMOST reviewed cell (non-empty, not '未チェック', not struck);
    // it is compared against the locale JSON (the source of truth), so a stale
    // baseline column can never suppress an update the way 'paired' does.
    // -----------------------------------------------------------------------
    if (layout === 'multi') {
      // A struck-through JSON Key cell (column A) marks a deleted key → skip
      // the whole row.
      if (struck.has(`A${excelRow}`)) {
        skippedDeletedRows.push({ key, excelRow });
        continue;
      }

      for (const [lang, cols] of Object.entries(multiColMap)) {
        // Walk right→left and take the first reviewed value (latest wins).
        let rawValue = null;
        for (let ci = cols.length - 1; ci >= 0; ci--) {
          const colIdx = cols[ci];
          // Skip struck-through cells (partial deletions / retracted revisions).
          if (struck.has(`${columnLetter(colIdx)}${excelRow}`)) continue;
          const candidate = String(row[colIdx] ?? '');
          const trimmedRaw = candidate.trim();
          if (!trimmedRaw || trimmedRaw === '未チェック') continue;
          rawValue = candidate;
          break;
        }
        if (rawValue === null) continue; // no reviewed value in any column

        recordResolvedValue(lang, key, excelRow, rawValue);
      }
      continue;
    }

    // -----------------------------------------------------------------------
    // Paired layout (legacy): "current" + "updated" column per language.
    // -----------------------------------------------------------------------
    for (const [lang, cols] of Object.entries(LANG_COLUMNS)) {
      const rawCurrent = String(row[cols.current] ?? '');
      const rawUpdated = String(row[cols.updated] ?? '');
      const currentVal = sanitizeValue(rawCurrent);
      const updatedVal = sanitizeValue(rawUpdated);

      // Skip: Updated column = '未チェック' means admin has not reviewed yet → no change
      if (updatedVal === '未チェック') continue;

      // Case 1: Updated column has a different value → need update
      if (updatedVal && updatedVal !== currentVal) {
        if (!diffFull[lang]) diffFull[lang] = {};
        if (!diffUpdates[lang]) diffUpdates[lang] = {};

        // Record transformation on the updated value (this is what gets written)
        recordIssues(lang, key, excelRow, rawUpdated, updatedVal, 'updated');

        diffFull[lang][key] = {
          oldValue: currentVal,
          newValue: updatedVal,
          excelRow,
        };

        diffUpdates[lang][key] = {
          value: updatedVal,
          excelRow,
        };

        totalChanges++;
        continue;
      }

      // Case 2: No updated value, but check if the current value from Excel
      // is missing in the locale JSON file → new key needs to be added
      const valueToCheck = updatedVal || currentVal;
      if (!valueToCheck) continue;

      if (localeData[lang] === null) continue; // locale file doesn't exist

      const existingValue = getNestedValue(localeData[lang], key);
      if (existingValue === undefined) {
        if (!diffFull[lang]) diffFull[lang] = {};
        if (!diffUpdates[lang]) diffUpdates[lang] = {};

        // Record transformation on the value being added
        const rawSource = updatedVal ? rawUpdated : rawCurrent;
        recordIssues(lang, key, excelRow, rawSource, valueToCheck, updatedVal ? 'updated' : 'current');

        diffFull[lang][key] = {
          oldValue: '',
          newValue: valueToCheck,
          excelRow,
          isNewKey: true,
        };

        diffUpdates[lang][key] = {
          value: valueToCheck,
          excelRow,
          isNewKey: true,
        };

        totalChanges++;
        totalNewKeys++;
      }
    }
  }

  return { diffFull, diffUpdates, transformedRecords, totalChanges, totalNewKeys, skippedDeletedRows };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { excelPath, layout } = parseArgs(process.argv);

  if (!['paired', 'single', 'multi'].includes(layout)) {
    console.error(`❌ Invalid --layout=${layout}. Use "paired", "single" or "multi".`);
    process.exit(1);
  }

  if (!excelPath) {
    console.error('❌ Thiếu đường dẫn file Excel. Truyền đường dẫn file .xlsx làm tham số đầu tiên.');
    process.exit(1);
  }

  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Excel file not found: ${excelPath}`);
    process.exit(1);
  }

  console.log(`📖 Reading: ${excelPath}`);
  console.log(`🧩 Layout:  ${layout}`);

  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  console.log(`📄 Sheet:   ${sheetName} (first sheet)`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const localeData = loadLocaleData();

  let singleColMap = null;
  let multiColMap = null;
  let strikeRefs = null;
  if (layout === 'single' || layout === 'multi') {
    if (layout === 'single') {
      singleColMap = buildSingleColumnMap(rows[0] || []);
      const detected = Object.keys(singleColMap);
      if (detected.length === 0) {
        console.error('❌ No language columns detected in header row.');
        console.error('   Expected headers like "ja (2026-07-26)", "vi (2026-07-26)", …');
        process.exit(1);
      }
      console.log(`🌐 Detected columns: ${detected.map((l) => `${l}→col${singleColMap[l]}`).join(', ')}`);
    } else {
      multiColMap = buildMultiColumnMap(rows[0] || []);
      const detected = Object.keys(multiColMap);
      if (detected.length === 0) {
        console.error('❌ No language columns detected in header row.');
        console.error('   Expected headers like "ja (2026-07-26)", "vi (2026-07-26)", …');
        process.exit(1);
      }
      console.log(`🌐 Detected columns: ${detected.map((l) => `${l}→[${multiColMap[l].join(',')}]`).join(', ')}`);
    }

    // Strikethrough = deleted key → ignore. Read from raw OOXML (SheetJS drops
    // font info). Best-effort: on failure, warn and continue without it.
    try {
      strikeRefs = await getStrikethroughRefs(excelPath, 0);
      console.log(`🚫 Strikethrough cells detected: ${strikeRefs.size}`);
    } catch (err) {
      console.warn(`⚠️  Could not read strikethrough styles — proceeding without deletion filter. (${err.message})`);
      strikeRefs = new Set();
    }
  }

  const { diffFull, diffUpdates, transformedRecords, totalChanges, totalNewKeys, skippedDeletedRows } =
    detectChanges({ rows, localeData, layout, singleColMap, multiColMap, strikeRefs });

  if (skippedDeletedRows && skippedDeletedRows.length > 0) {
    console.log(`\n🚫 Ignored ${skippedDeletedRows.length} deleted (struck-through) key(s):`);
    for (const d of skippedDeletedRows) {
      console.log(`     row ${d.excelRow}: ${d.key}`);
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const fullPath = path.join(OUTPUT_DIR, 'diff-full.json');
  const updatesPath = path.join(OUTPUT_DIR, 'diff-updates.json');

  fs.writeFileSync(fullPath, JSON.stringify(diffFull, null, 2), 'utf-8');
  fs.writeFileSync(updatesPath, JSON.stringify(diffUpdates, null, 2), 'utf-8');

  // Persist deleted (struck-through) keys so run.js can write a notice.
  const deletedKeysPath = path.join(OUTPUT_DIR, 'deleted-keys.json');
  fs.writeFileSync(deletedKeysPath, JSON.stringify(skippedDeletedRows || [], null, 2), 'utf-8');

  // Generate transformation check reports (markdown + xlsx)
  const transformMdPath = path.join(OUTPUT_DIR, 'i18n-transformed-check.md');
  const transformXlsxPath = path.join(OUTPUT_DIR, 'i18n-transformed-check.xlsx');
  const totalTransformed = Object.values(transformedRecords).reduce((sum, arr) => sum + arr.length, 0);

  if (totalTransformed > 0) {
    // Sort all records by excelRow
    for (const lang of Object.keys(transformedRecords)) {
      transformedRecords[lang].sort((a, b) => a.excelRow - b.excelRow);
    }

    // --- Markdown report ---
    const reportLines = [
      '# Báo cáo kiểm tra biến đổi dữ liệu i18n',
      '',
      `> Ngày tạo: ${new Date().toISOString()}`,
      '',
      'Danh sách các giá trị có vấn đề khi xử lý từ file Excel.',
      '',
      '- **Mã T (Trim):** Giá trị bị thay đổi do xóa ký tự thừa ở đầu/cuối — giá trị ghi vào locale JSON sẽ khác Excel.',
      '- **Mã W (Warning):** Cảnh báo nội dung bất thường bên trong văn bản — giá trị KHÔNG bị thay đổi nhưng có thể là lỗi nhập liệu.',
      '',
      '## Bảng mã lý do',
      '',
      '| Mã | Lý do |',
      '|----|-------|',
    ];

    for (const [, info] of Object.entries(TRANSFORM_TYPES)) {
      reportLines.push(`| ${info.code} | ${info.description} |`);
    }
    reportLines.push('');

    for (const lang of Object.keys(LANG_COLUMNS)) {
      const records = transformedRecords[lang];
      if (!records || records.length === 0) continue;

      reportLines.push(`## ${lang} (${records.length} giá trị có vấn đề)`);
      reportLines.push('');
      reportLines.push('| JSON Key | Giá trị gốc | Giá trị sau xử lý | Lý do | Cột Excel |');
      reportLines.push('|----------|-------------|-------------------|-------|-----------|');

      for (const record of records) {
        const rawDisplay = record.rawValue.replace(/\|/g, '\\|').replace(/\n/g, '↵').replace(/\r/g, '⏎').replace(/\t/g, '→');
        const finalDisplay = record.finalValue.replace(/\|/g, '\\|');
        // Each issue on its own line using <br> for markdown
        const descriptionLines = record.issues
          .map((t) => `${TRANSFORM_TYPES[t].code}: ${TRANSFORM_TYPES[t].description}`)
          .join('<br>');
        reportLines.push(`| \`${record.key}\` | ${rawDisplay} | ${finalDisplay} | ${descriptionLines} | Dòng ${record.excelRow} |`);
      }
      reportLines.push('');
    }

    reportLines.push('## Tổng kết');
    reportLines.push('');
    reportLines.push('| Ngôn ngữ | Số lượng |');
    reportLines.push('|----------|----------|');
    for (const lang of Object.keys(LANG_COLUMNS)) {
      const count = (transformedRecords[lang] || []).length;
      if (count > 0) {
        reportLines.push(`| ${lang} | ${count} |`);
      }
    }
    reportLines.push(`| **Tổng** | **${totalTransformed}** |`);
    reportLines.push('');

    fs.writeFileSync(transformMdPath, reportLines.join('\n'), 'utf-8');

    // --- Excel report (one sheet per language) ---
    // Each issue gets its own row so you can filter/sort per issue
    const transformWb = XLSX.utils.book_new();

    for (const lang of Object.keys(LANG_COLUMNS)) {
      const records = transformedRecords[lang];
      if (!records || records.length === 0) continue;

      const sheetData = [
        ['JSON Key', 'Giá trị gốc', 'Giá trị sau xử lý', 'Mã', 'Lý do', 'Cột Excel'],
      ];

      for (const record of records) {
        const column = `Dòng ${record.excelRow}`;

        // One row per issue for better filtering in Excel
        for (const issue of record.issues) {
          sheetData.push([
            record.key,
            record.rawValue,
            record.finalValue,
            TRANSFORM_TYPES[issue].code,
            TRANSFORM_TYPES[issue].description,
            column,
          ]);
        }
      }

      const transformSheet = XLSX.utils.aoa_to_sheet(sheetData);

      // Set column widths
      transformSheet['!cols'] = [
        { wch: 40 }, // JSON Key
        { wch: 60 }, // Giá trị gốc
        { wch: 60 }, // Giá trị sau xử lý
        { wch: 6 },  // Mã
        { wch: 55 }, // Lý do
        { wch: 25 }, // Cột Excel
      ];

      XLSX.utils.book_append_sheet(transformWb, transformSheet, lang);
    }

    XLSX.writeFile(transformWb, transformXlsxPath);
  }

  // Summary
  console.log('\n✅ Parse complete!\n');
  console.log(`Total changes detected: ${totalChanges} (${totalNewKeys} new key(s) missing from locale files)`);
  for (const [lang, keys] of Object.entries(diffUpdates)) {
    const newCount = Object.values(keys).filter((v) => v.isNewKey).length;
    const updateCount = Object.keys(keys).length - newCount;
    console.log(`  ${lang}: ${Object.keys(keys).length} key(s) (${updateCount} updated, ${newCount} new)`);
  }
  if (totalTransformed > 0) {
    console.log(`\n⚠️  ${totalTransformed} value(s) were transformed during parsing (see report)`);
  } else {
    console.log(`\n✅ No transformations detected — all values match Excel exactly`);
  }
  console.log(`\nOutput:`);
  console.log(`  (a) ${fullPath}`);
  console.log(`  (b) ${updatesPath}`);
  if (totalTransformed > 0) {
    console.log(`  (c) ${transformMdPath}`);
    console.log(`  (d) ${transformXlsxPath}`);
  }
}

main().catch((err) => {
  console.error(`❌ ${err.stack || err.message}`);
  process.exit(1);
});
