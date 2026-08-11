'use strict';

/**
 * Validate that an Excel file has the structure the chosen layout expects,
 * BEFORE the pipeline runs. Used by the TUI (step-input validation) so the user
 * gets a clear Vietnamese message — what is wrong, why, and how to fix it —
 * instead of a raw crash deep inside parse-translations.js.
 *
 * Layouts (see parse-translations.js for the full semantics):
 *   - paired: fixed columns — Key(A), reference(B), then a current+updated pair
 *             per language (headers like "ja (2026-04-20 stg)").
 *   - single: one column per language, header "ja (2026-07-26)".
 *   - multi:  one or more columns per language, same header shape as single.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const { detectLanguageColumns, languageLabel } = require('./languages');

// Paired layout needs at least Key(0), reference(1) and the first language pair
// (ja current=2, updated=3) → a header at least 4 columns wide.
const PAIRED_MIN_COLUMNS = 4;

/** Read the first worksheet as an array-of-arrays, or throw a tagged error. */
function readFirstSheetRows(excelPath) {
  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    const err = new Error('empty-workbook');
    err.code = 'EMPTY_WORKBOOK';
    throw err;
  }
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

/** Count rows (after the header) that carry a non-empty JSON key in column A. */
function countDataRows(rows) {
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    if (String((rows[i] || [])[0] || '').trim()) n++;
  }
  return n;
}

const EXPECTED_HEADER_HINT =
  'Header cột ngôn ngữ phải bắt đầu bằng mã ngôn ngữ + "(", ví dụ: "ja (2026-07-26)", "vi (2026-07-26)".';
const TEMPLATE_HINT =
  'Chưa có file đúng định dạng? Dùng công cụ "Tạo file Excel mẫu" ở menu để tạo file mẫu cho bố cục này.';

/**
 * @param {string} excelPath  Absolute path to the .xlsx file (already existence-checked).
 * @param {string} layout     'paired' | 'single' | 'multi' (defaults to 'paired').
 * @returns {{ok:true, info:object} | {ok:false, error:string}}
 */
function validateExcelForLayout(excelPath, layout = 'paired') {
  // Extension sanity check (xlsx can also read .xls/.xlsm, so allow those).
  if (!/\.(xlsx|xlsm|xls)$/i.test(excelPath)) {
    return {
      ok: false,
      error:
        'File không phải định dạng Excel (.xlsx).\n' +
        'Cách khắc phục: chọn file dịch thuật đuôi .xlsx (không phải .csv/.numbers/.txt).',
    };
  }

  let rows;
  try {
    rows = readFirstSheetRows(excelPath);
  } catch (err) {
    if (err.code === 'EMPTY_WORKBOOK') {
      return {
        ok: false,
        error: 'File Excel không có sheet nào.\nCách khắc phục: mở file và thêm dữ liệu dịch vào sheet đầu tiên.',
      };
    }
    return {
      ok: false,
      error:
        `Không đọc được file Excel (${err.message}).\n` +
        'Cách khắc phục: kiểm tra file không bị hỏng và đúng định dạng .xlsx (mở lại bằng Excel rồi lưu lại).',
    };
  }

  const header = rows[0] || [];
  if (header.length === 0) {
    return {
      ok: false,
      error: 'Sheet đầu tiên trống (không có dòng tiêu đề).\nCách khắc phục: thêm dòng header và dữ liệu vào sheet đầu tiên.',
    };
  }

  const dataRows = countDataRows(rows);
  if (dataRows === 0) {
    return {
      ok: false,
      error:
        'File chỉ có dòng tiêu đề, không có dòng dữ liệu nào (cột A "JSON Key" đều trống).\n' +
        'Cách khắc phục: thêm ít nhất một dòng có JSON Key ở cột A.',
    };
  }

  // --- Layout-specific checks --------------------------------------------
  if (layout === 'paired') {
    if (header.length < PAIRED_MIN_COLUMNS) {
      return {
        ok: false,
        error:
          `Bố cục "paired" cần tối thiểu ${PAIRED_MIN_COLUMNS} cột ` +
          '(Key + tham khảo + 1 cặp current/updated cho mỗi ngôn ngữ), ' +
          `nhưng file chỉ có ${header.length} cột.\n` +
          'Cách khắc phục: kiểm tra lại bố cục — có thể bạn cần chọn "single" hoặc "multi", ' +
          'hoặc dùng công cụ "Tạo file Excel mẫu".',
      };
    }
    return { ok: true, info: { layout, columns: header.length, dataRows } };
  }

  // single / multi: languages are detected from the header row.
  const map = detectLanguageColumns(header);
  const detected = Object.keys(map);
  if (detected.length === 0) {
    return {
      ok: false,
      error:
        'Không phát hiện cột ngôn ngữ nào trong dòng tiêu đề.\n' +
        `Lý do: ${EXPECTED_HEADER_HINT}\n` +
        `Cách khắc phục: sửa lại header cho đúng định dạng. ${TEMPLATE_HINT}`,
    };
  }

  const labels = detected.map((c) => languageLabel(c)).join(', ');
  return { ok: true, info: { layout, languages: detected, labels, dataRows } };
}

module.exports = { validateExcelForLayout };
