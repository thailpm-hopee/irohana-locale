#!/usr/bin/env node

'use strict';

/**
 * Generate an Excel *template* for the i18n-update tool. Standalone: it needs
 * no project root — only an output folder and a layout.
 *
 * Usage:
 *   node run.js --out-dir=<folder> [--layout=single|paired|multi] [--languages=vi,en,ja]
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { TEMPLATE_LAYOUTS, buildTemplateWorkbook } = require('./build-template');

function parseArgs(argv) {
  let outDir = null;
  let layout = 'paired';
  let languages = null;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--out-dir=')) {
      outDir = arg.slice('--out-dir='.length);
    } else if (arg.startsWith('--layout=')) {
      layout = arg.slice('--layout='.length);
    } else if (arg.startsWith('--languages=')) {
      languages = arg
        .slice('--languages='.length)
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (!arg.startsWith('--') && !outDir) {
      outDir = arg; // allow a positional folder too
    }
  }
  return { outDir, layout, languages };
}

function main() {
  const { outDir, layout, languages } = parseArgs(process.argv);

  if (!TEMPLATE_LAYOUTS.includes(layout)) {
    console.error(`❌ Bố cục không hợp lệ: --layout=${layout}. Dùng: ${TEMPLATE_LAYOUTS.join(', ')}.`);
    process.exit(1);
  }

  if (!outDir || !outDir.trim()) {
    console.error('❌ Thiếu thư mục xuất. Truyền --out-dir=<đường-dẫn>.');
    process.exit(1);
  }

  const targetDir = path.resolve(outDir.trim());
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`🧩 Bố cục:      ${layout}`);
  console.log(`🌐 Ngôn ngữ:    ${languages ? languages.join(', ') : '(tất cả)'}`);

  const wb = buildTemplateWorkbook({ layout, languages });
  const outputPath = path.join(targetDir, `i18n-template-${layout}.xlsx`);
  XLSX.writeFile(wb, outputPath);

  console.log(`\n✅ Đã tạo file mẫu!`);
  console.log(`   File: ${outputPath}`);
  console.log(`   Gồm 2 sheet: "Template" (điền dữ liệu) và "Hướng dẫn" (mô tả bố cục & quy tắc).`);
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs };
