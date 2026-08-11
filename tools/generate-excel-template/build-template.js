'use strict';

/**
 * Build an Excel *template* workbook for a given layout. Kept separate from
 * run.js (I/O) so it can be unit-tested: it returns an in-memory XLSX workbook
 * with exactly two sheets —
 *   1) "Template"    — the header + a few example rows to fill in.
 *   2) "Hướng dẫn"   — a Vietnamese guide explaining the layout and the rules.
 *
 * Language column definitions are shared with the i18n-update parser
 * (../i18n-update/languages) so a generated template always matches what the
 * parser expects to read back.
 */

const XLSX = require('xlsx');
const { LANG_CODES, LANG_COLUMNS, languageLabel } = require('../i18n-update/languages');

const TEMPLATE_LAYOUTS = ['single', 'paired', 'multi'];

const TEMPLATE_SHEET = 'Template';
const GUIDE_SHEET = 'Hướng dẫn';

// Demo rows: real-looking JSON keys with sample values. Languages without a
// sample get '未チェック' (unreviewed) to demonstrate the "skip" rule.
const EXAMPLE_KEYS = ['common.button.save', 'common.button.cancel', 'home.welcomeTitle'];
const SAMPLE_VALUES = {
  ja: ['保存', 'キャンセル', 'ようこそ'],
  vi: ['Lưu', 'Huỷ', 'Chào mừng'],
  en: ['Save', 'Cancel', 'Welcome'],
};
const UNREVIEWED = '未チェック';

/** Sample value for a language/row, or the "unreviewed" placeholder. */
function sampleFor(lang, rowIdx) {
  const arr = SAMPLE_VALUES[lang];
  return arr ? arr[rowIdx] : UNREVIEWED;
}

/** ISO date (YYYY-MM-DD) — injectable so tests are deterministic. */
function isoDate(date) {
  return (date || new Date()).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Per-layout template sheets (array-of-arrays)
// ---------------------------------------------------------------------------

/** single: one column per language, header "<lang> (<date>)". */
function buildSingleAoa(langs, date) {
  const header = ['JSON Key', ...langs.map((l) => `${l} (${date})`)];
  const rows = EXAMPLE_KEYS.map((key, r) => [key, ...langs.map((l) => sampleFor(l, r))]);
  return [header, ...rows];
}

/**
 * paired: FIXED columns per language (Key, reference, then current+updated
 * pair). Positions come from LANG_COLUMNS, so every known language keeps its
 * slot regardless of selection; only selected languages get sample data filled.
 */
function buildPairedAoa(langs, date) {
  const selected = new Set(langs);
  const width = Math.max(...Object.values(LANG_COLUMNS).map((c) => c.updated)) + 1;
  const header = new Array(width).fill('');
  header[0] = 'JSON Key';
  header[1] = 'テキストの場所 (vị trí / tham khảo)';
  for (const [lang, cols] of Object.entries(LANG_COLUMNS)) {
    header[cols.current] = `${lang} (${date} stg)`;
    header[cols.updated] = `${lang} (${date} 修正依頼)`;
  }

  const rows = EXAMPLE_KEYS.map((key, r) => {
    const row = new Array(width).fill('');
    row[0] = key;
    for (const [lang, cols] of Object.entries(LANG_COLUMNS)) {
      if (!selected.has(lang)) continue;
      row[cols.current] = sampleFor(lang, r);
      // Demo an update request on the first row so reviewers see the workflow.
      row[cols.updated] = r === 0 && SAMPLE_VALUES[lang] ? `${sampleFor(lang, r)} (sửa)` : '';
    }
    return row;
  });
  return [header, ...rows];
}

/**
 * multi: two columns per language — a baseline "<lang> (<date>)" and a revision
 * "<lang> (<date> rev1)". The RIGHTMOST reviewed cell wins, so the first demo
 * row fills rev1 to show it overriding the baseline.
 */
function buildMultiAoa(langs, date) {
  const header = ['JSON Key'];
  for (const l of langs) header.push(`${l} (${date})`, `${l} (${date} rev1)`);

  const rows = EXAMPLE_KEYS.map((key, r) => {
    const row = [key];
    for (const l of langs) {
      row.push(sampleFor(l, r));
      // Show a revision overriding the baseline on the first row only.
      row.push(r === 0 && SAMPLE_VALUES[l] ? `${sampleFor(l, r)} (rev1)` : '');
    }
    return row;
  });
  return [header, ...rows];
}

// ---------------------------------------------------------------------------
// Guide sheet (Vietnamese)
// ---------------------------------------------------------------------------

const LAYOUT_GUIDE = {
  single: [
    'Bố cục SINGLE — mỗi ngôn ngữ 1 cột.',
    'Cột A là "JSON Key". Mỗi cột ngôn ngữ có header dạng "<mã> (ngày)", ví dụ "vi (2026-08-10)".',
    'Giá trị trong ô CHÍNH là bản dịch mong muốn; công cụ sẽ so với common.json và cập nhật nếu khác.',
  ],
  paired: [
    'Bố cục PAIRED — mỗi ngôn ngữ 2 cột: current (stg) + updated (修正依頼).',
    'Vị trí cột là CỐ ĐỊNH theo ngôn ngữ (ja, vi, my, id, en, ne, km, mn, th, tl) — không đổi thứ tự cột.',
    'Nếu cột "updated" có giá trị khác "current" → công cụ cập nhật theo "updated".',
  ],
  multi: [
    'Bố cục MULTI — mỗi ngôn ngữ có 1 hoặc nhiều cột (baseline + các vòng revision).',
    'Header dạng "<mã> (ngày)". Ô ĐƯỢC DUYỆT ở cột PHẢI NHẤT sẽ thắng và được so với common.json.',
    'Có thể mỗi ngôn ngữ số cột khác nhau; công cụ tự phát hiện cột theo header.',
  ],
};

function buildGuideAoa(layout, langs) {
  const rows = [];
  rows.push(['HƯỚNG DẪN SỬ DỤNG FILE MẪU']);
  rows.push(['']);
  rows.push([`Bố cục: ${layout}`]);
  rows.push(['']);
  for (const line of LAYOUT_GUIDE[layout] || []) rows.push([line]);
  rows.push(['']);
  rows.push(['Quy tắc chung:']);
  rows.push([`- "${UNREVIEWED}": chưa duyệt → công cụ BỎ QUA, không cập nhật.`]);
  rows.push(['- Gạch ngang (strikethrough) ô JSON Key: đánh dấu key ĐÃ XOÁ → bỏ qua cả dòng (áp dụng cho single/multi).']);
  rows.push(['- Ô trống: không thay đổi giá trị hiện có.']);
  rows.push(['- Khoảng trắng thừa đầu/cuối câu và khoảng trắng kép sẽ được tự động dọn khi ghi vào locale.']);
  rows.push(['- Giá trị dạng mảng/đối tượng JSON (vd ["月","火"]) được giữ nguyên cấu trúc.']);
  rows.push(['']);
  rows.push(['Các mã ngôn ngữ hỗ trợ:']);
  for (const code of LANG_CODES) rows.push([`- ${languageLabel(code)}`]);
  rows.push(['']);
  rows.push([`Ngôn ngữ có trong file mẫu này: ${langs.join(', ')}`]);
  return rows;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {object}   opts
 * @param {string}   opts.layout      'single' | 'paired' | 'multi'
 * @param {string[]} [opts.languages] language codes to include (defaults to all)
 * @param {Date}     [opts.date]      injectable date for deterministic output
 * @returns {import('xlsx').WorkBook}
 */
function buildTemplateWorkbook({ layout, languages, date } = {}) {
  if (!TEMPLATE_LAYOUTS.includes(layout)) {
    throw new Error(`layout không hợp lệ: ${layout}. Dùng: ${TEMPLATE_LAYOUTS.join(', ')}.`);
  }
  // Keep requested languages in canonical order; default to all known codes.
  const req = Array.isArray(languages) && languages.length ? languages : LANG_CODES;
  const langs = LANG_CODES.filter((c) => req.includes(c));
  if (langs.length === 0) {
    throw new Error('Không có ngôn ngữ hợp lệ nào được chọn.');
  }

  const iso = isoDate(date);
  const aoa =
    layout === 'single'
      ? buildSingleAoa(langs, iso)
      : layout === 'paired'
        ? buildPairedAoa(langs, iso)
        : buildMultiAoa(langs, iso);

  const wb = XLSX.utils.book_new();
  const templateWs = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, templateWs, TEMPLATE_SHEET);

  const guideWs = XLSX.utils.aoa_to_sheet(buildGuideAoa(layout, langs));
  guideWs['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, guideWs, GUIDE_SHEET);

  return wb;
}

module.exports = {
  TEMPLATE_LAYOUTS,
  TEMPLATE_SHEET,
  GUIDE_SHEET,
  buildTemplateWorkbook,
};
