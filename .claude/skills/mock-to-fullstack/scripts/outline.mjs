#!/usr/bin/env node
/**
 * Reduce a design-doc screen HTML (a split screen file, or any inline-styled
 * mock) to a COMPACT JSON outline, so a sub-agent can plan from ~2 KB instead of
 * reading a 200-line, inline-styled, SVG-heavy screen (~15–40 KB). This is the
 * main token-saver of the mock-to-fullstack skill — run it, hand the JSON to the
 * planning/build sub-agents, and never feed the raw screen to a model.
 *
 * It keeps the signals that reliably drive CRUD/aggregate design — the screen
 * title, action buttons (classified to CRUD verbs), form controls, filters,
 * status chips, and a whitespace-collapsed text skeleton — and drops the noise
 * (inline styles, <svg> path data, font CSS).
 *
 * Usage:  node outline.mjs <screen.html> [--full]
 *   --full  include the complete text skeleton (default caps it to ~120 lines)
 */
import fs from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
if (!file) { console.error('Usage: node outline.mjs <screen.html> [--full]'); process.exit(1); }
const full = flags.includes('--full');
let html = fs.readFileSync(file, 'utf8');

// Drop noise the model never needs.
html = html
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ⟦icon⟧ ')   // svg subtrees → marker
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const screenLabel = (html.match(/data-screen-label="([^"]+)"/) || [])[1]
  || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';

// Verb → CRUD op. JP + EN. First match wins.
const VERBS = [
  [/追加|作成|新規|登録|add\b|create|new\b/i, 'create'],
  [/編集|変更|更新|save|update|edit/i, 'update'],
  [/削除|remove|delete/i, 'delete'],
  [/インポート|取り込|import/i, 'import'],
  [/エクスポート|書き出|csv|export|ダウンロード|download/i, 'export'],
  [/検索|search/i, 'search'],
  [/フィルタ|絞り込|filter/i, 'filter'],
  [/同期|sync|再認証|reauth|接続|connect/i, 'sync'],
  [/確認|confirm|続行|proceed|次へ|next|完了|done|保存/i, 'submit'],
];
function classify(text) {
  for (const [re, op] of VERBS) if (re.test(text)) return op;
  return 'action';
}

// Tolerant tag/text walk — no DOM dependency.
const tokens = [...html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g)];
const actions = [];
const fields = [];
const chips = [];
const lines = [];
let depth = 0;
const clean = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

let pendingTag = null;        // tag whose text we are collecting for action/field detection
for (const t of tokens) {
  const [, close, tag, attrs, text] = t;
  if (text !== undefined) {
    const c = clean(text);
    if (!c || c === '⟦icon⟧') continue;
    lines.push('  '.repeat(Math.min(depth, 12)) + c);
    // Button-ish text (short, actiony) → action. Heuristic: any non-input clickable-looking element.
    if (pendingTag && /button|a|role="button"/i.test(pendingTag) && c.length <= 24) {
      actions.push({ text: c, op: classify(c) });
    }
    // Status/label chips: very short standalone tokens near status words.
    if (c.length <= 8 && /確定|未確認|レビュー|出荷済|未出荷|エラー|警告|注意|完了|処理中|NEW|Free|Pro/i.test(c)) {
      chips.push(c);
    }
    continue;
  }
  if (close) { depth = Math.max(0, depth - 1); pendingTag = null; continue; }
  const selfClose = /\/\s*$/.test(attrs) || /^(input|img|br|hr|meta|link|source)$/i.test(tag);
  const a = attrs || '';
  // Form controls (reliable field signals).
  if (/^input$/i.test(tag)) {
    fields.push({ kind: 'input', type: (a.match(/type="([^"]+)"/) || [])[1] || 'text',
      placeholder: clean((a.match(/placeholder="([^"]+)"/) || [])[1] || ''),
      name: (a.match(/name="([^"]+)"/) || [])[1] || '' });
  } else if (/^select$/i.test(tag)) {
    fields.push({ kind: 'select', name: (a.match(/name="([^"]+)"/) || [])[1] || '' });
  } else if (/^textarea$/i.test(tag)) {
    fields.push({ kind: 'textarea', name: (a.match(/name="([^"]+)"/) || [])[1] || '' });
  }
  // Element whose immediate text we want to inspect (buttons, links, chips).
  pendingTag = /^(button|a)$/i.test(tag) || /role="button"/i.test(a) ? (tag + ' ' + a) : null;
  if (!selfClose) depth++;
}

// Dedup actions by text; keep first op.
const seenAct = new Set();
const dedupActions = actions.filter(x => (seenAct.has(x.text) ? false : seenAct.add(x.text)));
const ops = [...new Set(dedupActions.map(a => a.op))];

let skeleton = lines.filter(Boolean);
const capped = !full && skeleton.length > 120;
if (capped) skeleton = skeleton.slice(0, 120);

console.log(JSON.stringify({
  file,
  screenLabel,
  detectedOps: ops,                 // e.g. ["create","import","search","filter"]
  actions: dedupActions,
  fields,
  statusChips: [...new Set(chips)],
  counts: {
    actions: dedupActions.length, fields: fields.length,
    icons: (html.match(/⟦icon⟧/g) || []).length,
  },
  textSkeletonTruncated: capped,
  textSkeleton: skeleton.join('\n'),
}, null, 2));
