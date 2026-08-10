---
name: scr-bundle-split
description: Split a Tobirato design-doc "bundle" HTML (the large self-unpacking canvas export, e.g. "Tobirato SCR 全画面.html" / "Companion 全29画面") into an editable folder — a shared/ folder (fonts + design tokens) plus one static, self-viewable HTML file per screen. Use when asked to split, unpack, extract, or "separate" a bundled/monolithic design-doc HTML into per-screen files, or when the extracted screens show oversized/broken SVG icons.
---

# scr-bundle-split

Turn a monolithic design-doc bundle (a single ~20 MB self-unpacking HTML exported
from the canvas tool) into a folder you can actually work in: shared fonts + tokens
once, and one small static HTML per screen. Editing one screen no longer means
loading a 20 MB file.

## When to use

- "Split / unpack / extract / separate `<X> 全画面.html` into per-screen files."
- The extracted screens render with **oversized icons** (the `sc-camel-view-box`
  bug — see *Known gotcha* below).
- You need shared design tokens / fonts factored out of a bundle.

## Do this first — just run the script

The whole split is deterministic. **Do not read the bundle into context** (it is
~20 MB / ~18 M-char single lines and will blow your context). Run:

```bash
node .claude/skills/scr-bundle-split/scripts/split-bundle.mjs "<bundle.html>" "<out-dir>"
```

The raw canvas bundles and their split output live under `docs/handoff/`, which is
**git-ignored** (CLAUDE.md's raw-Logio-canon rule) — so nothing here is ever
committed. Current locations:

- Source bundle: `docs/handoff/Tobirato SCR 全画面.html`
- Split output (recommended `<out-dir>`): `docs/handoff/scr-screens/`

So the concrete invocation from the repo root is:

```bash
node .claude/skills/scr-bundle-split/scripts/split-bundle.mjs \
  "docs/handoff/Tobirato SCR 全画面.html" "docs/handoff/scr-screens"
```

It prints a JSON report and exits non-zero if the icon fix left any placeholder
behind. Typical output for the SCR bundle: `53 screens, 386 fonts, 12.7 MB,
camelPlaceholdersLeft: 0`. Keep the split output under `docs/handoff/` so the
13 MB of fonts stay out of git; putting it anywhere tracked would need a new
`.gitignore` rule.

## Verify (cheap, always do it)

Render 2–3 screens headless and look at them — do NOT eyeball the HTML:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --window-size=1600,1050 \
  --screenshot=/tmp/check.png "docs/handoff/scr-screens/screens/SCR-080-17a.html"
```

Then Read `/tmp/check.png`. Product-card placeholder icons should sit small inside
their cards. If any icon fills its whole card → the icon fix did not apply.

## Known gotcha — oversized SVG icons (the whole reason this skill exists)

The canvas tool stores camelCase SVG attributes (`viewBox`,
`preserveAspectRatio`, …) as lowercase `sc-camel-<kebab>` placeholders, because
the HTML parser lowercases attribute names and would otherwise destroy `viewBox`.
Its runtime restores the real camelCase attribute at render time. When we split to
static files we drop that runtime, so we must restore them statically. Otherwise
every `<svg>` loses its `viewBox`, falls back to intrinsic size, and renders
**huge**.

`reference/icon-oversize-bug.png` shows it: left = original template (correct),
right = a broken extraction (icons blown up). `reference/icon-fixed-example.png`
shows the corrected result.

The script already does this (`restoreCamel`, converting `sc-camel-view-box` →
`viewBox`, `sc-camel-preserve-aspect-ratio` → `preserveAspectRatio`, and any other
`sc-camel-*`). If you ever hand-edit screen HTML or write a different extractor,
you MUST apply the same transform, or the report's `camelPlaceholdersLeft` will be
non-zero and icons break.

## How the bundle is structured (for when the script needs adapting)

The bundle is a self-unpacking artifact. Real content lives in `<script>` data
islands in the tail of the file, NOT in the visible DOM:

- `<script type="__bundler/manifest">` — JSON `{uuid: {mime, compressed, data}}`.
  `data` is base64; if `compressed`, it is gzip. For the SCR bundle this is almost
  all woff2 font subsets plus a little JS.
- `<script type="__bundler/template">` — a JSON-encoded string: the actual page.
  UUIDs in it are placeholders the runtime swaps for blob URLs.
- `<script type="__bundler/ext_resources">` — maps CDN URLs (React etc.) to UUIDs.
- `<script type="__bundler/page_order">` — `[]` for a single page (SCR bundle);
  non-empty means nested iframe pages (handle separately).

Inside the template string:
- `<helmet>` holds several `<style>` blocks — the `@font-face` ones (fonts) and one
  `:root` tokens block. → `shared/fonts.css` + `shared/tokens.css`.
- `<section>` holds the screens. Each screen is a top-level `<div id="…">` preceded
  by a `<!-- ==== -->` comment marker and containing a `data-screen-label="SCR-XXX …"`.
  Split on the comment markers.
- Screens are **static HTML + CSS** using `var(--token)` — they need no JS/React to
  render, only `fonts.css` + `tokens.css`.

## Output contract

```
<out-dir>/
├─ shared/
│  ├─ fonts.css      @font-face → url("fonts/<family>-<weight>-<subset>.woff2")
│  ├─ fonts/         the .woff2 files
│  └─ tokens.css     :root variables + base body/a/keyframe styles
└─ screens/
   ├─ index.html         gallery linking every screen
   └─ SCR-<code>-<id>.html   one per screen; <link>s the two shared stylesheets
```

Screen files open directly over `file://`. A companion `README.md` explaining the
layout is worth writing into `<out-dir>` for the next person.
