#!/usr/bin/env node

/**
 * Script 4: Export merged Excel
 *
 * Reads the original Excel file, and for each language pair:
 *   - If the "Updated" column has a value → copy it to the "Current" column
 *   - Clear the "Updated" column
 * Exports the result as a new .xlsx file.
 *
 * This saves you from manually copying updated values back to the current column.
 *
 * Usage:
 *   node export-merged-excel.js <path-to-excel> --project-root=<path>
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { resolveOutputDir } = require('../_shared/project');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OUTPUT_DIR = resolveOutputDir('i18n-update');

// Updated column indices (0-indexed) — these are the "修正依頼" columns
const UPDATED_COLUMNS = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
// Corresponding current column indices — these are the "stg" columns
const CURRENT_COLUMNS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // First non-flag arg is the Excel path.
  const excelPath = process.argv.slice(2).find((a) => !a.startsWith('--'));

  if (!excelPath) {
    console.error('❌ Thiếu đường dẫn file Excel. Truyền đường dẫn file .xlsx làm tham số đầu tiên.');
    process.exit(1);
  }

  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Excel file not found: ${excelPath}`);
    process.exit(1);
  }

  console.log(`📖 Reading: ${excelPath}`);

  const wb = XLSX.readFile(excelPath);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  console.log(`📄 Sheet:   ${sheetName} (first sheet)`);

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let movedCount = 0;

  // Process data rows (skip header at index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const key = String(row[0] || '').trim();
    if (!key) continue;

    for (let j = 0; j < UPDATED_COLUMNS.length; j++) {
      const updatedIdx = UPDATED_COLUMNS[j];
      const currentIdx = CURRENT_COLUMNS[j];
      const updatedVal = String(row[updatedIdx] ?? '').trim();

      // Skip '未チェック' — admin has not reviewed yet
      if (updatedVal && updatedVal !== '未チェック') {
        row[currentIdx] = updatedVal; // Move updated → current
        row[updatedIdx] = '';         // Clear updated
        movedCount++;
      }
    }
  }

  // Update header row: rename "Current" columns to reflect new date
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '-');
  const headerRow = rows[0];
  for (const idx of CURRENT_COLUMNS) {
    const original = String(headerRow[idx] || '');
    // Replace date pattern in header, e.g. "ja (2026-04-20 stg)" → "ja (2026-04-28 stg)"
    headerRow[idx] = original.replace(/\d{4}-\d{2}-\d{2}/, today);
  }
  for (const idx of UPDATED_COLUMNS) {
    const original = String(headerRow[idx] || '');
    // Update the date placeholder in "修正依頼" headers too
    headerRow[idx] = original.replace(/\d{4}-\d{2}-\d{2}/, today);
  }

  // Build new workbook
  const newWs = XLSX.utils.aoa_to_sheet(rows);

  // Copy column widths from original if available
  if (ws['!cols']) {
    newWs['!cols'] = ws['!cols'];
  }

  const newWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(newWb, newWs, sheetName);

  // Output
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(OUTPUT_DIR, `localize_merged_${timestamp}.xlsx`);

  XLSX.writeFile(newWb, outputPath);

  console.log(`\n✅ Export complete!`);
  console.log(`  Moved ${movedCount} cell(s) from Updated → Current`);
  console.log(`  Output: ${outputPath}`);
}

main();
