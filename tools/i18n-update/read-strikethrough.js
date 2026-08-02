#!/usr/bin/env node

/**
 * Strikethrough reader
 *
 * SheetJS (`xlsx`) does not expose font strikethrough, so we read the raw
 * OOXML from the .xlsx (a zip archive) directly to find which cells are struck
 * through. In the localization sheet, a strikethrough on a row marks a
 * "deleted" key that should be ignored.
 *
 * Exports:
 *   getStrikethroughRefs(excelPath, sheetIndex=0)
 *     → Promise<Set<string>>  e.g. Set { 'A189', 'C189', ... }
 *   columnLetter(colIndex)     0 → 'A', 1 → 'B', 26 → 'AA'
 */

const fs = require('fs');
const JSZip = require('jszip');

/** Convert a 0-based column index to its Excel letter (0→A, 25→Z, 26→AA). */
function columnLetter(colIndex) {
  let n = colIndex;
  let letter = '';
  do {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/** Resolve the worksheet XML path for the Nth sheet (workbook order). */
function resolveSheetPath(workbookXml, relsXml, sheetIndex) {
  const sheetTags = workbookXml.match(/<sheet\b[^>]*\/>/g) || [];
  const target = sheetTags[sheetIndex];
  if (!target) throw new Error(`Sheet index ${sheetIndex} not found in workbook.xml`);

  const ridMatch = target.match(/r:id="([^"]+)"/);
  if (!ridMatch) throw new Error('Sheet has no r:id in workbook.xml');
  const rid = ridMatch[1];

  const rels = relsXml.match(/<Relationship\b[^>]*\/>/g) || [];
  for (const rel of rels) {
    if (rel.includes(`Id="${rid}"`)) {
      const t = rel.match(/Target="([^"]+)"/);
      if (t) return 'xl/' + t[1].replace(/^\/?xl\//, '').replace(/^\//, '');
    }
  }
  throw new Error(`No relationship target found for ${rid}`);
}

/** Font indices (into <fonts>) that carry <strike/>. */
function strikeFontIndices(stylesXml) {
  const fontsBlock = (stylesXml.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/) || [])[1] || '';
  const fonts = fontsBlock.match(/<font>[\s\S]*?<\/font>|<font\s*\/>/g) || [];
  const set = new Set();
  fonts.forEach((f, i) => { if (/<strike\s*\/>/.test(f)) set.add(i); });
  return set;
}

/** cellXfs indices (the value of a cell's s="..") that reference a strike font. */
function strikeStyleIndices(stylesXml, strikeFonts) {
  const xfsBlock = (stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
  const xfs = xfsBlock.match(/<xf[\s\S]*?(?:\/>|<\/xf>)/g) || [];
  const set = new Set();
  xfs.forEach((xf, i) => {
    const m = xf.match(/fontId="(\d+)"/);
    if (m && strikeFonts.has(Number(m[1]))) set.add(i);
  });
  return set;
}

/**
 * Read the .xlsx and return the set of cell references whose text is struck
 * through, e.g. Set { 'A189', 'C189', 'D189', ... }.
 */
async function getStrikethroughRefs(excelPath, sheetIndex = 0) {
  const buf = fs.readFileSync(excelPath);
  const zip = await JSZip.loadAsync(buf);

  const stylesXml = await zip.file('xl/styles.xml').async('string');
  const strikeFonts = strikeFontIndices(stylesXml);
  if (strikeFonts.size === 0) return new Set(); // no strikethrough anywhere

  const strikeStyles = strikeStyleIndices(stylesXml, strikeFonts);
  if (strikeStyles.size === 0) return new Set();

  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetPath = resolveSheetPath(workbookXml, relsXml, sheetIndex);
  const sheetXml = await zip.file(sheetPath).async('string');

  const cells = sheetXml.match(/<c\b[^>]*?\/>|<c\b[^>]*?>[\s\S]*?<\/c>/g) || [];
  const refs = new Set();
  for (const c of cells) {
    const r = c.match(/r="([A-Z]+\d+)"/);
    const s = c.match(/\bs="(\d+)"/);
    if (r && s && strikeStyles.has(Number(s[1]))) refs.add(r[1]);
  }
  return refs;
}

module.exports = { getStrikethroughRefs, columnLetter };
