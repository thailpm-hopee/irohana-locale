#!/usr/bin/env node

/**
 * i18n update pipeline runner
 *
 * Usage:
 *   node run.js <path-to-excel> --project-root=<path> [--layout=paired|single]
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { resolveProjectRoot, resolveLocalesDir, resolveOutputDir } = require('../_shared/project');

const SCRIPT_DIR = __dirname;

// Resolve the project context once, then export it to the environment so every
// child script (parse/update/export) resolves the SAME root + output dir,
// regardless of whether this runner was invoked via the TUI (env) or the
// --project-root flag (manual CLI use).
const PROJECT_ROOT = resolveProjectRoot();
const OUTPUT_DIR = resolveOutputDir('i18n-update');
const LOCALES_DIR = resolveLocalesDir();
process.env.IRL_PROJECT_ROOT = PROJECT_ROOT;
process.env.IRL_OUTPUT_DIR = OUTPUT_DIR;

const NOTICES_PATH = path.join(OUTPUT_DIR, 'notices.md');
const SEPARATOR = '='.repeat(60);

// Special character patterns to detect in translation values
const SPECIAL_CHAR_PATTERNS = [
  { pattern: /\\n/g, label: '\\n (literal newline escape)' },
  { pattern: /\\t/g, label: '\\t (literal tab escape)' },
  { pattern: /\\r/g, label: '\\r (literal carriage return escape)' },
  { pattern: /\n/g, label: 'newline character' },
  { pattern: /\t/g, label: 'tab character' },
  { pattern: /\r/g, label: 'carriage return character' },
  { pattern: /{{[^}]+}}/g, label: '{{interpolation}}' },
  { pattern: /<[^>]+>/g, label: 'HTML tag' },
];

// Escape sequences that Excel/CSV sources may double-escape.
// Each entry maps a wrongly-escaped literal to the correct character.
const ESCAPE_NORMALIZATIONS = [
  { literal: '\\n', replacement: '\n' },
  { literal: '\\t', replacement: '\t' },
  { literal: '\\r', replacement: '\r' },
];

const PIPELINE_STEPS = [
  { label: 'Parse translations from Excel',        script: 'parse-translations.js',  needsExcel: true },
  { label: 'Update locale files',                   script: 'update-locales.js',      needsExcel: false },
  // The merge-export step moves "Updated → Current"; it only applies to the
  // paired layout. The single-column layout has no Updated column, so skip it.
  { label: 'Export merged Excel (Updated → Current)', script: 'export-merged-excel.js', needsExcel: true, pairedOnly: true },
];

/**
 * Parse CLI args: an optional Excel path (first non-flag arg) and an optional
 * `--layout=single|paired` flag (defaults to `paired`).
 */
function parseArgs(argv) {
  let excelPath = null;
  let layout = 'paired';
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--layout=')) {
      layout = arg.slice('--layout='.length);
    } else if (!arg.startsWith('--')) {
      excelPath = arg;
    }
  }
  return { excelPath, layout };
}

function runStep(stepNumber, label, command) {
  console.log(`\n${SEPARATOR}`);
  console.log(`▶ Step ${stepNumber}: ${label}`);
  console.log(SEPARATOR);
  try {
    execSync(command, { stdio: 'inherit', cwd: SCRIPT_DIR });
  } catch (err) {
    console.error(`\n❌ Bước "${label}" thất bại (mã lỗi ${err.status ?? 1}). Dừng quy trình.`);
    process.exit(err.status || 1);
  }
}

function main() {
  const { excelPath, layout } = parseArgs(process.argv);

  if (!['paired', 'single'].includes(layout)) {
    console.error(`❌ Invalid --layout=${layout}. Use "paired" or "single".`);
    process.exit(1);
  }

  if (!excelPath) {
    console.error('❌ Thiếu đường dẫn file Excel. Truyền đường dẫn file .xlsx làm tham số đầu tiên.');
    process.exit(1);
  }

  const excelArg = `"${excelPath}"`;
  const layoutArg = `--layout=${layout}`;

  console.log('🚀 i18n Update Workflow');
  console.log(`   Project root: ${PROJECT_ROOT}`);
  console.log(`   Output dir:   ${OUTPUT_DIR}`);
  console.log(`   Layout:       ${layout}`);

  const steps = PIPELINE_STEPS.filter((step) => !(step.pairedOnly && layout !== 'paired'));

  steps.forEach((step, i) => {
    const parts = [`node ${step.script}`];
    if (step.needsExcel && excelArg) parts.push(excelArg);
    // Only the parser understands --layout; other steps ignore it.
    if (step.script === 'parse-translations.js') parts.push(layoutArg);
    runStep(i + 1, step.label, parts.join(' '));

    // After parsing, sanitize escape sequences before updating locale files
    if (step.script === 'parse-translations.js') {
      sanitizeEscapeSequences();
    }
  });

  // Post-pipeline: format locale files with prettier to match project conventions
  formatLocalesWithPrettier();

  // Post-pipeline: detect special cases in translations and generate notification
  generateSpecialCasesNotice();

  // Post-pipeline: record deleted (struck-through) keys that were NOT applied
  generateDeletedKeysNotice();

  console.log(`\n${SEPARATOR}`);
  console.log('🎉 Workflow complete!');
  console.log(`   Output dir: ${OUTPUT_DIR}`);
  console.log(SEPARATOR);
}

/**
 * Sanitize double-escaped sequences (e.g. literal "\\n" → real "\n") in
 * diff-updates.json so that update-locales.js writes correct values.
 * Logs every replacement for transparency.
 */
function sanitizeEscapeSequences() {
  const diffPath = path.join(OUTPUT_DIR, 'diff-updates.json');
  if (!fs.existsSync(diffPath)) return;

  const updates = JSON.parse(fs.readFileSync(diffPath, 'utf-8'));
  const fixes = [];

  for (const [lang, keys] of Object.entries(updates)) {
    for (const [key, entry] of Object.entries(keys)) {
      let value = entry.value;
      // Structured values (arrays/objects) have no escape sequences to fix.
      if (typeof value !== 'string') continue;
      let changed = false;

      for (const { literal, replacement } of ESCAPE_NORMALIZATIONS) {
        if (value.includes(literal)) {
          value = value.split(literal).join(replacement);
          changed = true;
        }
      }

      if (changed) {
        fixes.push({ lang, key, excelRow: entry.excelRow, before: entry.value, after: value });
        entry.value = value;
      }
    }
  }

  if (fixes.length === 0) {
    console.log('\n  ✅ No double-escaped sequences found.');
    return;
  }

  fs.writeFileSync(diffPath, JSON.stringify(updates, null, 2), 'utf-8');

  console.log(`\n  🔧 Fixed ${fixes.length} double-escaped value(s):`);
  for (const f of fixes) {
    console.log(`     [${f.lang}] ${f.key} (row ${f.excelRow})`);
    console.log(`       before: ${JSON.stringify(f.before)}`);
    console.log(`       after:  ${JSON.stringify(f.after)}`);
  }
}

/**
 * Run prettier on all locale JSON files so the output matches the project's
 * formatting rules (e.g. short arrays stay on one line within printWidth).
 */
function formatLocalesWithPrettier() {
  console.log(`\n${SEPARATOR}`);
  console.log('▶ Formatting locale files with Prettier');
  console.log(SEPARATOR);

  const localeGlob = path.join(LOCALES_DIR, '**/*.json');
  try {
    execSync(`npx prettier --write "${localeGlob}"`, {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    console.log('  ✅ Locale files formatted successfully.');
  } catch (err) {
    console.warn('  ⚠️  Prettier formatting failed — locale files were saved without formatting.');
  }
}

/**
 * Scan diff-updates.json for values containing special characters
 * (e.g. \n, \t, HTML tags, interpolation placeholders) and:
 *   1. Print a console warning
 *   2. Write a notice section into notices.md (inside the output dir)
 */
function generateSpecialCasesNotice() {
  const diffPath = path.join(OUTPUT_DIR, 'diff-updates.json');
  if (!fs.existsSync(diffPath)) return;

  const updates = JSON.parse(fs.readFileSync(diffPath, 'utf-8'));
  const findings = []; // { lang, key, excelRow, matches: string[] }

  for (const [lang, keys] of Object.entries(updates)) {
    for (const [key, entry] of Object.entries(keys)) {
      const value = entry.value;
      // Structured values (arrays/objects) carry no special-character text.
      if (typeof value !== 'string') continue;
      const matched = [];

      for (const { pattern, label } of SPECIAL_CHAR_PATTERNS) {
        // Reset lastIndex for global regexes
        pattern.lastIndex = 0;
        if (pattern.test(value)) {
          matched.push(label);
        }
      }

      if (matched.length > 0) {
        findings.push({ lang, key, excelRow: entry.excelRow, matches: matched });
      }
    }
  }

  if (findings.length === 0) {
    console.log('\n✅ No special-case text detected in updated translations.');
    return;
  }

  // Console warning
  console.log(`\n${SEPARATOR}`);
  console.log(`⚠️  Special-case text detected: ${findings.length} value(s)`);
  console.log(SEPARATOR);
  for (const f of findings) {
    console.log(`  [${f.lang}] ${f.key} (row ${f.excelRow}): ${f.matches.join(', ')}`);
  }

  // Write notice to notices.md
  appendSpecialCasesNotice(findings);
}

/** Read the notices file (empty string if it does not exist yet). */
function readNotices() {
  return fs.existsSync(NOTICES_PATH) ? fs.readFileSync(NOTICES_PATH, 'utf-8') : '';
}

/**
 * Append (or replace) a "Special Cases Notice" section in notices.md.
 */
function appendSpecialCasesNotice(findings) {
  let content = readNotices();

  // Build the notice section
  const timestamp = new Date().toISOString();
  const lines = [
    '## Special Cases Notice (auto-generated)',
    '',
    `> Last updated: ${timestamp}`,
    '',
    'The following translations contain special characters that may need manual review:',
    '',
    '| Language | JSON Key | Excel Row | Special Characters |',
    '|----------|----------|-----------|-------------------|',
  ];

  for (const f of findings) {
    const escapedMatches = f.matches.join(', ').replace(/\|/g, '\\|');
    lines.push(`| ${f.lang} | \`${f.key}\` | ${f.excelRow} | ${escapedMatches} |`);
  }

  lines.push('');
  lines.push('**Legend:**');
  lines.push('- `\\n` — literal newline escape (intended line break in UI)');
  lines.push('- `\\t` — literal tab escape');
  lines.push('- `\\r` — literal carriage return escape');
  lines.push('- `newline character` — actual newline in the string value');
  lines.push('- `tab character` — actual tab in the string value');
  lines.push('- `{{interpolation}}` — dynamic placeholder (e.g. `{{count}}`)');
  lines.push('- `HTML tag` — embedded HTML (e.g. `<br>`, `<b>`)');
  lines.push('');

  const noticeContent = lines.join('\n');
  const SECTION_MARKER_START = '## Special Cases Notice (auto-generated)';

  // Replace existing section or append
  const markerIdx = content.indexOf(SECTION_MARKER_START);
  if (markerIdx !== -1) {
    const afterMarker = content.substring(markerIdx + SECTION_MARKER_START.length);
    const nextHeadingMatch = afterMarker.match(/\n## (?!Special Cases Notice)/);
    if (nextHeadingMatch) {
      const endIdx = markerIdx + SECTION_MARKER_START.length + nextHeadingMatch.index;
      content = content.substring(0, markerIdx) + noticeContent + content.substring(endIdx);
    } else {
      content = content.substring(0, markerIdx) + noticeContent;
    }
  } else {
    content = content.trimEnd() + '\n\n' + noticeContent;
  }

  fs.writeFileSync(NOTICES_PATH, content.trimStart(), 'utf-8');
  console.log(`\n📝 Special cases notice written to ${NOTICES_PATH}`);
}

/**
 * Read output/deleted-keys.json (struck-through keys skipped during parsing)
 * and record them in notices.md so reviewers know which keys were intentionally
 * NOT applied to the locale files. Only relevant in single-column layout.
 */
function generateDeletedKeysNotice() {
  const deletedPath = path.join(OUTPUT_DIR, 'deleted-keys.json');
  if (!fs.existsSync(deletedPath)) return;

  let deleted;
  try {
    deleted = JSON.parse(fs.readFileSync(deletedPath, 'utf-8'));
  } catch {
    return;
  }
  if (!Array.isArray(deleted) || deleted.length === 0) {
    console.log('\n✅ No deleted (struck-through) keys detected.');
    return;
  }

  console.log(`\n${SEPARATOR}`);
  console.log(`🚫 Deleted (struck-through) keys skipped: ${deleted.length}`);
  console.log(SEPARATOR);
  for (const d of deleted) {
    console.log(`  ${d.key} (row ${d.excelRow})`);
  }

  appendDeletedKeysNotice(deleted);
}

/**
 * Append (or replace) a "Deleted Keys Notice" section in notices.md.
 */
function appendDeletedKeysNotice(deleted) {
  let content = readNotices();

  const timestamp = new Date().toISOString();
  const lines = [
    '## Deleted Keys Notice (auto-generated)',
    '',
    `> Last updated: ${timestamp}`,
    '',
    'These keys were marked as **deleted** (strikethrough) in the Excel and were',
    '**NOT** added to or updated in the locale files. Review whether they should',
    'also be removed from `src/i18n/locales/*/common.json`.',
    '',
    '| JSON Key | Excel Row |',
    '|----------|-----------|',
  ];

  for (const d of deleted) {
    lines.push(`| \`${d.key}\` | ${d.excelRow} |`);
  }
  lines.push('');

  const noticeContent = lines.join('\n');
  const SECTION_MARKER_START = '## Deleted Keys Notice (auto-generated)';

  const markerIdx = content.indexOf(SECTION_MARKER_START);
  if (markerIdx !== -1) {
    const afterMarker = content.substring(markerIdx + SECTION_MARKER_START.length);
    const nextHeadingMatch = afterMarker.match(/\n## (?!Deleted Keys Notice)/);
    if (nextHeadingMatch) {
      const endIdx = markerIdx + SECTION_MARKER_START.length + nextHeadingMatch.index;
      content = content.substring(0, markerIdx) + noticeContent + content.substring(endIdx);
    } else {
      content = content.substring(0, markerIdx) + noticeContent;
    }
  } else {
    content = content.trimEnd() + '\n\n' + noticeContent;
  }

  fs.writeFileSync(NOTICES_PATH, content.trimStart(), 'utf-8');
  console.log(`\n📝 Deleted keys notice written to ${NOTICES_PATH}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateDeletedKeysNotice, generateSpecialCasesNotice };
