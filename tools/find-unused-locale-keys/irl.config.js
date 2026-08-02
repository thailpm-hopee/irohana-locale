'use strict';

/**
 * TUI manifest for the "find unused locale keys" tool.
 * Consumed by the irl TUI to render the menu entry and collect inputs.
 */
module.exports = {
  id: 'find-unused-locale-keys',
  title: 'Tìm key locale không dùng',
  description:
    'Quét thư mục src/ để tìm các key trong file locale không còn được sử dụng. Xuất báo cáo Markdown + JSON.',
  entry: 'find-unused-keys.js',
  order: 3,
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
    {
      name: 'lang',
      type: 'text',
      label: 'Ngôn ngữ chuẩn để lấy danh sách key',
      hint: 'Ví dụ: en, ja, vi. Bỏ trống để dùng "en".',
      required: false,
      default: 'en',
      cache: true,
      pass: { kind: 'arg' },
    },
  ],
};
