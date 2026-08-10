# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`irl` (irohana-locale) is an interactive **TUI launcher** for the localization
scripts of the **irohana-study** project. It presents the tools in a menu,
collects their inputs via drag-and-drop paths and menus, runs each as a child
process, and streams the logs live. **All user-facing UI strings are Vietnamese** —
match that when editing UI text.

The launcher does not live inside the target repo. Each tool asks for a
**project root** (a repo containing `src/i18n/locales`) and remembers the last
value so the next run only needs Enter.

## Commands

```bash
npm start          # launch the TUI (requires an interactive TTY)
npm run build      # "build" = node --check syntax pass over every source file
npm test           # node --test — runs test/*.test.mjs
node --test test/paths.test.mjs   # run a single test file
```

There is **no bundler, transpiler, linter, or TypeScript** — the project is
plain JS run directly by Node ≥18. `npm run build` (scripts/check-syntax.mjs)
only syntax-checks files with `node --check`; it does not emit anything. CI
(.github/workflows/ci.yml) runs `build` + `test` on Node 18/20/22, and the
husky pre-commit hook runs `npm run build && npm test`.

Run any tool standalone, without the TUI:

```bash
node tools/i18n-update/run.js "/path/file.xlsx" --project-root="/path/repo" \
  [--layout=paired|single|multi] [--languages=vi,en,ja]
node tools/export-localization/run.js --project-root="/path/repo"
node tools/find-unused-locale-keys/find-unused-keys.js --project-root="/path/repo" [lang]
```

## Architecture

Two layers with a deliberate boundary between them:

- **`src/` — the TUI shell (ESM `.mjs`).** Uses Ink + React with the `htm`
  tagged-template helper (`src/html.mjs`), so there is **no JSX and no build
  step** — write `` html`<${Box}>…<//>` `` instead of JSX. `src/app.mjs` holds
  the whole UI: a screen state machine (`menu → input → running → done`, plus
  `settings`) and the terminal line editor.
- **`tools/<tool>/` — the actual scripts (CommonJS `.js`).** Each tool is
  self-contained and knows nothing about the TUI. It reads its context from
  `--project-root=` / `IRL_PROJECT_ROOT` and its output dir from
  `IRL_OUTPUT_DIR`, via `tools/_shared/project.js`.

### How a tool is defined and discovered

`src/discover.mjs` scans `tools/*/irl.config.js` (dirs starting with `_` are
skipped, so `tools/_shared/` is shared code, not a tool). Each config is a
CommonJS manifest:

```js
module.exports = {
  id, title, description,
  entry: 'run.js',        // the script spawned as a child process
  order: 1,               // menu position (ascending); ties break on title
  optionalOutputs: true,  // outputs are optional → see "compact mode" below
  inputs: [ /* … */ ],
};
```

**Adding a new tool = adding a `tools/<name>/irl.config.js` + entry script.**
No registration elsewhere; discovery is automatic. A config that throws while
loading is shown as a broken/disabled menu entry rather than crashing the menu.

### Input → invocation flow

Each `inputs[]` entry declares `type` (`folder` | `file` | `text` | `select` |
`multiselect`), plus `required`, `cache`, `default`, an optional `when(values)`
predicate for conditional steps, and a `pass` rule that decides how the value
reaches the child process:

- `pass: { kind: 'env', key: 'IRL_PROJECT_ROOT' }` → set as an env var
- `pass: { kind: 'flag', key: '--layout' }` → pushed as `--layout=<value>`
- `pass: { kind: 'arg' }` (default) → pushed as a positional arg

`src/runner.mjs` `buildInvocation()` turns collected values into `{ env, args }`
(skipping inputs hidden by `when`, and joining multiselect arrays with commas),
then `runTool()` spawns `node <entry> …args` and streams stdout/stderr
line-by-line back to the UI.

`choices` (for select/multiselect) may be a **function of the collected values**
— e.g. i18n-update's language multiselect calls `detectExcelLanguages(v.excel)`
to build its options from the chosen Excel file, and its `when` hides the step
unless layout is `multi` and languages were detected.

### State persisted outside the repo (`~/.config/irohana-locale/`)

Uses `$XDG_CONFIG_HOME` if set, else `~/.config/irohana-locale/`:

- **`cache.json`** (`src/cache.mjs`) — last value of each `cache: true` input,
  keyed by `toolId.inputName`. Powers "press Enter to reuse last path."
- **`settings.json`** (`src/settings.mjs`) — `keepReports` (default false) and
  `disabledTools` (hidden from the menu; at least one tool always stays on).

**Compact mode:** when a tool sets `optionalOutputs: true` and `keepReports` is
off, `startRun()` in app.mjs points `IRL_OUTPUT_DIR` at a temp dir and deletes
it on exit, so the target repo only gets its locale files changed — no
`irl-output/` folder. Currently only i18n-update opts in.

### Tool output convention

`tools/_shared/project.js` is the single source of truth for locating things.
Tools write to `IRL_OUTPUT_DIR` if set, else `<projectRoot>/irl-output/<toolId>/`.
`resolveProjectRoot()` hard-validates that `src/i18n/locales` exists under the
root and exits with a Vietnamese error otherwise; `src/paths.mjs`
`resolveAndValidate()` enforces the same check in the TUI before running.

The two multi-step pipelines (`i18n-update`, `export-localization`) have a
top-level `run.js` that resolves the project context once, re-exports it via
`process.env`, then invokes sub-scripts (`execSync`/`execFileSync`) so every
step agrees on the same root and output dir.

## Conventions

- **ESM in `src/`** (`import`), **CommonJS in `tools/`** (`require`); the
  `package.json` `type` is `commonjs`, so ESM files must use the `.mjs`
  extension. Don't convert one layer to the other.
- **Drag-and-drop paths** are normalized by `sanitizeDraggedPath()` in
  `src/paths.mjs` (strips surrounding quotes, unescapes `\ `, expands `~`).
  This is the tested seam — `test/paths.test.mjs` covers it and the line-editor
  word/segment helpers in app.mjs (`wordStart`/`segmentStart`/…) are exported
  specifically to be unit-testable.
- Vietnamese for anything the user sees (menu labels, hints, errors, logs);
  code comments are English.
