#!/usr/bin/env node
/**
 * Split a Tobirato "design-doc bundle" HTML (the 19 MB self-unpacking artifact
 * exported from the canvas tool) into an editable folder:
 *
 *   <out>/shared/fonts.css      all @font-face rules (rewritten to local paths)
 *   <out>/shared/fonts/         the .woff2 files
 *   <out>/shared/tokens.css     :root design tokens + base element styles
 *   <out>/screens/index.html    gallery of every screen
 *   <out>/screens/SCR-*.html    one static, self-viewable file per screen
 *
 * Screens are static HTML+CSS; the React/x-dc runtime in the bundle was only the
 * canvas viewer and is intentionally dropped.
 *
 * Usage:  node split-bundle.mjs <bundle.html> <out-dir>
 *
 * Deterministic — safe to re-run; <out-dir> is rebuilt each time.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) {
  console.error('Usage: node split-bundle.mjs <bundle.html> <out-dir>');
  process.exit(1);
}

const html = fs.readFileSync(SRC, 'utf8');
function grab(type) {
  const re = new RegExp('<script type="__bundler/' + type + '">([\\s\\S]*?)</script>', 'i');
  const m = html.match(re);
  return m ? m[1].trim() : null;
}
const manifest = JSON.parse(grab('manifest'));
const template = JSON.parse(grab('template'));

const dirShared = path.join(OUT, 'shared');
const dirFonts = path.join(dirShared, 'fonts');
const dirScreens = path.join(OUT, 'screens');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(dirFonts, { recursive: true });
fs.mkdirSync(dirScreens, { recursive: true });

// ── 1. Shared CSS: font-face styles + token style, from <helmet> ──
const helmet = template.match(/<helmet>([\s\S]*?)<\/helmet>/i)[1];
const styleBlocks = [...helmet.matchAll(/<style>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
const fontStyles = styleBlocks.filter(s => /@font-face/.test(s));
const tokenStyles = styleBlocks.filter(s => !/@font-face/.test(s));

// ── 2. Decode fonts, name them, rewrite url("<uuid>") -> url("fonts/<name>") ──
let fontCss = fontStyles.join('\n');
const uuidToFile = {};
const used = new Set();
const slug = s => String(s).replace(/['"]/g, '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const faceRe = /\/\*\s*([^*]+?)\s*\*\/\s*|@font-face\s*\{([\s\S]*?)\}/g;
let subset = 'x', m;
while ((m = faceRe.exec(fontCss)) !== null) {
  if (m[1] !== undefined) { subset = slug(m[1]); continue; }
  const body = m[2];
  const fam = (body.match(/font-family:\s*([^;]+);/) || [])[1] || 'font';
  const wght = (body.match(/font-weight:\s*([^;]+);/) || [])[1] || '400';
  const style = (body.match(/font-style:\s*([^;]+);/) || [])[1] || 'normal';
  const uuid = (body.match(/url\("([^"]+)"\)/) || [])[1];
  if (!uuid || !manifest[uuid]) continue;
  const base = `${slug(fam)}-${slug(wght)}${slug(style) === 'normal' ? '' : '-' + slug(style)}-${subset}`;
  let name = base + '.woff2', n = 2;
  while (used.has(name)) name = `${base}-${n++}.woff2`;
  used.add(name); uuidToFile[uuid] = name;
}
let fontBytes = 0;
for (const [uuid, name] of Object.entries(uuidToFile)) {
  const e = manifest[uuid];
  let bytes = Buffer.from(e.data, 'base64');
  if (e.compressed) bytes = zlib.gunzipSync(bytes);
  fs.writeFileSync(path.join(dirFonts, name), bytes);
  fontBytes += bytes.length;
}
fontCss = fontCss.replace(/url\("([^"]+)"\)/g, (full, uuid) =>
  uuidToFile[uuid] ? `url("fonts/${uuidToFile[uuid]}")` : full);
fs.writeFileSync(path.join(dirShared, 'fonts.css'),
  `/* Tobirato — shared @font-face (${Object.keys(uuidToFile).length} woff2 subsets, auto-extracted).\n` +
  ` * Browsers fetch only the subsets each screen uses (unicode-range). */\n\n` + fontCss.trim() + '\n');
fs.writeFileSync(path.join(dirShared, 'tokens.css'),
  `/* Tobirato — shared design tokens (:root) + base styles. Edit once, all screens update. */\n\n` +
  tokenStyles.join('\n').trim() + '\n');

// ── 3. Restore camelCase SVG attributes (THE ICON FIX) ──
// The canvas tool stores camelCase SVG attrs as lowercase `sc-camel-<kebab>`
// placeholders (the HTML parser lowercases attribute names) and its runtime
// restores them at render time. We drop that runtime, so restore statically —
// otherwise SVGs lose viewBox/preserveAspectRatio and render at intrinsic size
// (the oversized-icon bug — see reference/icon-oversize-bug.png).
const restoreCamel = s => s.replace(/\bsc-camel-([a-z-]+)=/g,
  (_, k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + '=');

// ── 4. Split <section> into one file per screen ──
const sectionInner = restoreCamel(template.match(/<section[^>]*>([\s\S]*?)<\/section>/i)[1]);
const screens = [];
for (const part of sectionInner.split(/(?=<!--\s*=+)/)) {
  if (!/data-screen-label=/.test(part)) continue;
  const label = (part.match(/data-screen-label="([^"]+)"/) || [])[1] || 'screen';
  const id = (part.match(/<div id="([^"]+)"/) || [])[1] || String(screens.length + 1);
  const scr = (label.match(/^(SCR-[0-9a-z]+)/) || [])[1] || 'SCR';
  screens.push({ label, id, scr, html: part.trim() });
}
const seen = {};
for (const s of screens) {
  let f = `${s.scr}-${s.id}.html`;
  if (seen[f]) f = f.replace(/\.html$/, `-${++seen[f]}.html`); else seen[f] = 1;
  s.file = f;
}
const page = s => `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${s.label}</title>
<link rel="stylesheet" href="../shared/fonts.css">
<link rel="stylesheet" href="../shared/tokens.css">
<style>
  body { display:flex; flex-direction:column; gap:16px; padding:48px; align-items:flex-start; }
  .screen-meta { font:600 13px/1.4 var(--font-body); color:var(--plaster-6); }
  .screen-meta a { color:var(--plaster-6); }
</style>
</head>
<body>
<div class="screen-meta">${s.scr} &nbsp;·&nbsp; ${s.label} &nbsp;·&nbsp; <a href="index.html">← all screens</a></div>
${s.html}
</body>
</html>
`;
for (const s of screens) fs.writeFileSync(path.join(dirScreens, s.file), page(s));

const rows = screens.map(s =>
  `    <li><a href="${s.file}"><span class="scr">${s.scr}</span> ${s.label.replace(new RegExp('^' + s.scr + '\\s*'), '')}</a></li>`).join('\n');
fs.writeFileSync(path.join(dirScreens, 'index.html'), `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tobirato — screens</title>
<link rel="stylesheet" href="../shared/fonts.css"><link rel="stylesheet" href="../shared/tokens.css">
<style>
  body { padding:48px; font-family:var(--font-body); color:var(--text-primary); }
  h1 { font:600 24px/1.3 var(--font-display); color:var(--text-title); margin:0 0 4px; }
  p.sub { color:var(--text-tertiary); margin:0 0 28px; font-size:13px; }
  ul { list-style:none; padding:0; margin:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:8px; }
  li a { display:flex; gap:10px; align-items:baseline; padding:12px 14px; border:1px solid var(--border-subtle);
         border-radius:var(--radius-md); background:var(--bg-base); color:var(--text-primary); text-decoration:none; font-size:14px; }
  li a:hover { border-color:var(--border-focus); box-shadow:var(--shadow-card); }
  .scr { font-weight:700; color:var(--brand-5); font-size:12px; min-width:74px; }
</style></head>
<body>
<h1>Tobirato — all screens</h1>
<p class="sub">${screens.length} screens · shared tokens & fonts in ../shared/</p>
<ul>
${rows}
</ul>
</body></html>
`);

// ── 5. Report + self-check ──
const leftover = screens.filter(s => /sc-camel-/.test(s.html)).length;
console.log(JSON.stringify({
  screens: screens.length,
  fonts: Object.keys(uuidToFile).length,
  fontsMB: +(fontBytes / 1048576).toFixed(1),
  camelPlaceholdersLeft: leftover,   // must be 0
  out: OUT,
}, null, 2));
if (leftover) { console.error('WARN: sc-camel- placeholders survived — icons may be oversized'); process.exit(2); }
