#!/usr/bin/env node

/**
 * Find unused locale keys.
 *
 * Reads <projectRoot>/src/i18n/locales/{lang}/common.json, flattens to
 * dot-notation keys, then scans <projectRoot>/src for usages. A key is
 * considered USED when:
 *   1. It appears verbatim inside any source file as a string literal
 *      (e.g. t("studySettings.title"), i18nKey="foo.bar").
 *   2. It matches a dynamic prefix used in a template literal — e.g.
 *      t(`studySettings.studyTime.${button.labelKey}`) marks every key
 *      under `studySettings.studyTime.*` as potentially used.
 *
 * The script intentionally errs on the side of "used" — keys flagged as
 * unused should still be eyeballed before deletion.
 *
 * Usage:
 *   node find-unused-keys.js --project-root=<path>            (uses en as canonical)
 *   node find-unused-keys.js <lang> --project-root=<path>     (e.g. ja, vi)
 */

const path = require('path');
const fs = require('fs');
const { resolveLocalesDir, resolveSrcDir, resolveOutputDir } = require('../_shared/project');

// ---------------------------------------------------------------------------
// Config (project paths come from the TUI / --project-root, not __dirname)
// ---------------------------------------------------------------------------

const TOOL_ID = 'find-unused-locale-keys';
const LOCALES_DIR = resolveLocalesDir();
const SRC_DIR = resolveSrcDir();
const OUTPUT_DIR = resolveOutputDir(TOOL_ID);
const REPORT_PATH = path.join(OUTPUT_DIR, 'unused-keys-report.md');
const JSON_PATH = path.join(OUTPUT_DIR, 'unused-keys.json');

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
// Skip the locale JSON files themselves and tests / generated assets.
const SKIP_DIR_NAMES = new Set(['__test__', 'locales', 'node_modules']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenKeys(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v, full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function walkSourceFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walkSourceFiles(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Pull every dot-notation token (literal or template-prefix) out of source files.
 * Returns:
 *   - literals: Set<string> — exact dotted keys found in quoted strings
 *   - prefixes: Set<string> — dotted prefixes found before `${...}` in template literals
 */
function collectReferencesFromSource(files) {
  const literals = new Set();
  const prefixes = new Set();

  // Quoted string ("..", '..', `..`) containing at least one dot, no spaces, no ${}
  // We capture the raw token text and later filter by membership in the key set.
  const LITERAL_RE = /['"`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]/g;

  // Template literal prefix before ${...} interpolation, e.g. `foo.bar.${x}`
  // Captures the dotted prefix up to (but not including) the trailing dot before ${.
  const TEMPLATE_PREFIX_RE = /`([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\.\$\{/g;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf-8');

    let m;
    LITERAL_RE.lastIndex = 0;
    while ((m = LITERAL_RE.exec(src)) !== null) {
      literals.add(m[1]);
    }
    TEMPLATE_PREFIX_RE.lastIndex = 0;
    while ((m = TEMPLATE_PREFIX_RE.exec(src)) !== null) {
      prefixes.add(m[1]);
    }
  }

  return { literals, prefixes };
}

function isKeyReferenced(key, literals, prefixes) {
  if (literals.has(key)) return true;
  for (const p of prefixes) {
    if (key === p || key.startsWith(p + '.')) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // First non-flag arg is the canonical language (defaults to `en`).
  const lang = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'en';
  const localeFile = path.join(LOCALES_DIR, lang, 'common.json');

  if (!fs.existsSync(localeFile)) {
    console.error(`❌ Locale file not found: ${localeFile}`);
    process.exit(1);
  }

  console.log(`📖 Reading canonical keys from: ${lang}/common.json`);
  const localeData = JSON.parse(fs.readFileSync(localeFile, 'utf-8'));
  const allKeys = flattenKeys(localeData);
  console.log(`   ${allKeys.length} flattened keys`);

  console.log(`🔍 Scanning source files under: ${SRC_DIR}`);
  const sourceFiles = walkSourceFiles(SRC_DIR);
  console.log(`   ${sourceFiles.length} source files`);

  const { literals, prefixes } = collectReferencesFromSource(sourceFiles);
  console.log(`   ${literals.size} literal references, ${prefixes.size} template prefixes`);

  const unused = [];
  for (const key of allKeys) {
    if (!isKeyReferenced(key, literals, prefixes)) {
      unused.push(key);
    }
  }

  // Group unused keys by top-level namespace for readability.
  const grouped = unused.reduce((acc, key) => {
    const ns = key.split('.')[0];
    (acc[ns] ||= []).push(key);
    return acc;
  }, {});

  // ---- Write JSON ----
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(
    JSON_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        canonicalLanguage: lang,
        totalKeys: allKeys.length,
        unusedCount: unused.length,
        unused,
      },
      null,
      2
    ),
    'utf-8'
  );

  // ---- Write Markdown report ----
  const lines = [
    '# Unused Locale Keys Report',
    '',
    `> Generated: ${new Date().toISOString()}`,
    `> Canonical locale: \`${lang}/common.json\``,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Total keys | ${allKeys.length} |`,
    `| Literal references in source | ${literals.size} |`,
    `| Template-literal prefixes | ${prefixes.size} |`,
    `| **Unused keys** | **${unused.length}** |`,
    '',
    '## Caveats',
    '',
    '- Keys built from fully dynamic strings (e.g. `t(variableHoldingKey)`) cannot be detected and may show up as unused.',
    '- Template literals with a static prefix (e.g. `` t(`foo.bar.${x}`) ``) mark every `foo.bar.*` key as used — review such groups before deleting.',
    '- Always verify with a `grep` before removing a flagged key.',
    '',
  ];

  if (unused.length === 0) {
    lines.push('## Result');
    lines.push('');
    lines.push('🎉 No unused keys detected.');
  } else {
    lines.push('## Unused Keys');
    lines.push('');
    const namespaces = Object.keys(grouped).sort();
    for (const ns of namespaces) {
      lines.push(`### \`${ns}\` (${grouped[ns].length})`);
      lines.push('');
      for (const k of grouped[ns]) {
        lines.push(`- \`${k}\``);
      }
      lines.push('');
    }
  }

  fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf-8');

  console.log(`\n✅ Done.`);
  console.log(`   Unused: ${unused.length} / ${allKeys.length}`);
  console.log(`   Report: ${REPORT_PATH}`);
  console.log(`   JSON:   ${JSON_PATH}`);
}

main();
