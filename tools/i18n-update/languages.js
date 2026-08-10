'use strict';

/**
 * Shared language definitions + header detection for the i18n-update tool.
 *
 * Used by both parse-translations.js (the parser) and irl.config.js (the TUI,
 * to populate the "which languages to update" question). Keeping it in one
 * place means the codes and the header-parsing rule never drift apart.
 */

const fs = require('fs');
const XLSX = require('xlsx');

// Column mapping for the PAIRED layout: language code → [current, updated]
// (0-indexed). A(0)=Key, B(1)=Image, then a current+updated pair per language.
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

// Vietnamese display names per code, for a friendlier UI label. Codes not
// listed here fall back to showing just the raw code (see languageLabel).
const LANG_NAMES = {
  ja: 'Tiếng Nhật',
  vi: 'Tiếng Việt',
  my: 'Tiếng Miến Điện',
  id: 'Tiếng Indonesia',
  en: 'Tiếng Anh',
  ne: 'Tiếng Nepal',
  km: 'Tiếng Khmer',
  mn: 'Tiếng Mông Cổ',
  th: 'Tiếng Thái',
  tl: 'Tiếng Tagalog',
};

/**
 * A human label for a language code: "ja (Tiếng Nhật)" when the name is known,
 * otherwise just the raw code (e.g. a newly added language). Keeps the code
 * visible either way so it always maps back to the locale folder name.
 */
function languageLabel(code) {
  const name = LANG_NAMES[code];
  return name ? `${code} (${name})` : code;
}

/**
 * Detect language columns from a header row for the header-driven layouts
 * (single / multi). A header cell belongs to a language when it starts with a
 * known code followed by "(" — e.g. "ja (2026-07-26)" or "en (rev2)".
 * Returns { code → [columnIndex, …] } preserving left→right order, so a
 * language may map to any number of columns and languages may differ in count.
 */
function detectLanguageColumns(headerRow) {
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

// Memoize detection by path + mtime. The TUI calls detectExcelLanguages on
// every re-render (each keystroke) while the language picker is open, and
// XLSX.readFile unzips the whole workbook — so without this a large sheet would
// lag on every key. The mtime key invalidates if the file changes.
const _langCache = new Map();

/**
 * Ordered list of language codes present in an Excel file's first-sheet header.
 * Order follows LANG_CODES so the UI list is deterministic. Reads only the
 * header row (sheetRows: 1) for speed. Best-effort: returns [] on any error.
 */
function detectExcelLanguages(excelPath) {
  try {
    const { mtimeMs } = fs.statSync(excelPath);
    const cacheKey = `${excelPath}@${mtimeMs}`;
    const cached = _langCache.get(cacheKey);
    if (cached) return cached;

    const wb = XLSX.readFile(excelPath, { sheetRows: 1 });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const map = detectLanguageColumns(rows[0] || []);
    const langs = LANG_CODES.filter((code) => code in map);

    _langCache.set(cacheKey, langs);
    return langs;
  } catch {
    return [];
  }
}

module.exports = {
  LANG_COLUMNS,
  LANG_CODES,
  LANG_NAMES,
  languageLabel,
  detectLanguageColumns,
  detectExcelLanguages,
};
