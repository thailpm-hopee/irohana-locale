'use strict';

/**
 * TUI manifest for the "export localization" pipeline.
 */
module.exports = {
  id: 'export-localization',
  title: 'Xuất gói localization (ZIP)',
  description:
    'Gộp toàn bộ dữ liệu dịch (XLSX tổng hợp + JSON từng ngôn ngữ) thành localization.zip để bàn giao cho team dịch.',
  entry: 'run.js',
  order: 2,
  inputs: [
    {
      name: 'projectRoot',
      type: 'folder',
      label: 'Thư mục dự án (chứa src/i18n/locales)',
      hint: 'Kéo-thả thư mục gốc của repo vào đây rồi Enter.',
      required: true,
      cache: true,
      pass: { kind: 'env', key: 'IRL_PROJECT_ROOT' },
    },
  ],
};
