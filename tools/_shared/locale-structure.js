'use strict';

/**
 * Single source of truth for what a valid "project root" looks like, so the
 * TUI (step-input validation) and the runtime scripts (project.js) agree and
 * never drift apart.
 *
 * The check is **schema-driven** on purpose: today irohana-study keeps its
 * locale files under `src/i18n/locales/<lang>/common.json`, but a future repo
 * may use a different layout. Add another entry to `LOCALE_STRUCTURES` and pass
 * its id to `validateLocaleRoot()` — no other code has to change.
 */

const path = require('path');
const fs = require('fs');

/**
 * Known locale layouts, keyed by id.
 *   - localesSubpath: path segments from the project root to the locales dir.
 *   - fileName:       the translation file expected inside each language dir.
 *   - langDirPattern: what a language directory name looks like (2–3 letters).
 */
const LOCALE_STRUCTURES = {
  'irohana-study': {
    localesSubpath: ['src', 'i18n', 'locales'],
    fileName: 'common.json',
    langDirPattern: /^[a-z]{2,3}$/i,
  },
};

const DEFAULT_STRUCTURE_ID = 'irohana-study';

/** Join the project root with a structure's locales subpath. */
function localesDirOf(root, structure) {
  return path.join(root, ...structure.localesSubpath);
}

/**
 * List language directories under the locales dir that actually contain the
 * expected translation file. Returns [] on any filesystem error.
 */
function listLanguagesWithFile(localesDir, structure) {
  try {
    return fs
      .readdirSync(localesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && structure.langDirPattern.test(d.name))
      .map((d) => d.name)
      .filter((name) => fs.existsSync(path.join(localesDir, name, structure.fileName)))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Validate that `root` is a real project root for the given locale layout.
 *
 * Returns one of:
 *   { ok: true,  languages: string[], localesDir }
 *   { ok: false, error: string }              // Vietnamese: what/why/how-to-fix
 *
 * The error string is written to be shown as-is to the user (TUI in red, or
 * runtime stderr). Each case says what is wrong AND how to check / fix it.
 */
function validateLocaleRoot(root, structureId = DEFAULT_STRUCTURE_ID) {
  const structure = LOCALE_STRUCTURES[structureId] || LOCALE_STRUCTURES[DEFAULT_STRUCTURE_ID];
  const rel = structure.localesSubpath.join('/');
  const localesDir = localesDirOf(root, structure);

  // 1) The locales directory itself must exist.
  if (!fs.existsSync(localesDir)) {
    return {
      ok: false,
      error:
        `Thư mục dự án không hợp lệ: thiếu "${rel}".\n` +
        `Lý do: đây phải là thư mục GỐC của repo chứa locale, không phải thư mục con.\n` +
        `Cách khắc phục: mở repo và kiểm tra có tồn tại "${rel}/". ` +
        `Kéo-thả đúng thư mục gốc (thư mục chứa "${structure.localesSubpath[0]}/").`,
    };
  }

  // 2) It must be a directory (not a file that happens to share the name).
  if (!fs.statSync(localesDir).isDirectory()) {
    return {
      ok: false,
      error:
        `"${rel}" tồn tại nhưng không phải là thư mục.\n` +
        `Cách khắc phục: kiểm tra lại — "${rel}" phải là thư mục chứa các thư mục ngôn ngữ.`,
    };
  }

  // 3) It must contain at least one language dir with the translation file.
  const languages = listLanguagesWithFile(localesDir, structure);
  if (languages.length === 0) {
    return {
      ok: false,
      error:
        `Không tìm thấy file "${structure.fileName}" nào trong "${rel}".\n` +
        `Lý do: cần tối thiểu một thư mục ngôn ngữ như "${rel}/vi/${structure.fileName}".\n` +
        `Cách khắc phục: kiểm tra "${rel}/" có các thư mục ngôn ngữ (vi, en, ja…) ` +
        `và mỗi thư mục có file "${structure.fileName}".`,
    };
  }

  return { ok: true, languages, localesDir };
}

module.exports = {
  LOCALE_STRUCTURES,
  DEFAULT_STRUCTURE_ID,
  validateLocaleRoot,
  listLanguagesWithFile,
};
