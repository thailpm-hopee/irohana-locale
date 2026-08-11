'use strict';

const { LANG_CODES, languageLabel } = require('../i18n-update/languages');

/**
 * TUI manifest for the "generate Excel template" tool. Produces a starter
 * .xlsx (Template sheet + Guide sheet) for whichever layout the i18n-update
 * pipeline expects, so users always have a correctly-structured file to fill in.
 *
 * Needs no project root — only an output folder and a layout.
 */
module.exports = {
  id: 'generate-excel-template',
  title: 'Tạo file Excel mẫu',
  description:
    'Tạo file .xlsx mẫu (kèm sheet hướng dẫn) cho bố cục single / paired / multi để dùng với "Cập nhật i18n từ Excel".',
  entry: 'run.js',
  // Same order value as export-localization (2); tie breaks on title, so this
  // sorts right after "Cập nhật i18n từ Excel" (T < X).
  order: 2,
  inputs: [
    {
      name: 'outDir',
      type: 'folder',
      label: 'Thư mục lưu file mẫu',
      hint: 'Kéo-thả thư mục muốn lưu file mẫu vào đây rồi Enter.',
      required: true,
      cache: true,
      pass: { kind: 'flag', key: '--out-dir' },
    },
    {
      name: 'layout',
      type: 'select',
      label: 'Bố cục file mẫu',
      required: true,
      cache: true,
      default: 'paired',
      choices: [
        { value: 'paired', label: 'Paired — 2 cột/ngôn ngữ (current + updated) [mặc định]' },
        { value: 'single', label: 'Single — 1 cột/ngôn ngữ (header "<lang> (ngày)")' },
        { value: 'multi', label: 'Multi — nhiều cột/ngôn ngữ (baseline + revision)' },
      ],
      pass: { kind: 'flag', key: '--layout' },
    },
    {
      name: 'languages',
      type: 'multiselect',
      label: 'Ngôn ngữ đưa vào file mẫu',
      hint: 'Space để bật/tắt · mặc định chọn tất cả.',
      required: true,
      cache: true,
      default: 'all',
      choices: () => LANG_CODES.map((code) => ({ value: code, label: languageLabel(code) })),
      pass: { kind: 'flag', key: '--languages' },
    },
  ],
};
