'use strict';

/**
 * Shared helpers so every tool script can run **standalone** (installed as a
 * global package via `npm i -g .`) instead of assuming it lives inside the app
 * repo.
 *
 * The project root (the app repo that contains `src/i18n/locales`) is provided
 * by the caller in one of two ways:
 *   1. `--project-root=/abs/path` CLI flag  (takes precedence)
 *   2. `IRL_PROJECT_ROOT` environment variable  (set by the TUI runner)
 *
 * Outputs are written to `<projectRoot>/irl-output/<toolId>` by default, or to
 * `IRL_OUTPUT_DIR` when the TUI provides one. This keeps generated files out of
 * the (possibly global / read-only) package directory and next to the repo they
 * belong to, where they are easy to find.
 */

const path = require('path');
const fs = require('fs');

/** Read `--project-root=...` from argv, if present. */
function projectRootFromArgv(argv) {
  const hit = (argv || process.argv).find((a) => a.startsWith('--project-root='));
  return hit ? hit.slice('--project-root='.length) : null;
}

/**
 * Resolve and validate the project root. Exits the process with a clear
 * Vietnamese message when it is missing or does not look like the app repo.
 */
function resolveProjectRoot(argv) {
  const raw = projectRootFromArgv(argv) || process.env.IRL_PROJECT_ROOT || '';
  if (!raw.trim()) {
    console.error('❌ Thiếu đường dẫn thư mục dự án.');
    console.error('   Truyền qua cờ --project-root=<đường-dẫn> hoặc biến môi trường IRL_PROJECT_ROOT.');
    process.exit(1);
  }

  const root = path.resolve(raw.trim());
  const localesDir = path.join(root, 'src', 'i18n', 'locales');
  if (!fs.existsSync(localesDir)) {
    console.error(`❌ Không tìm thấy "src/i18n/locales" trong thư mục dự án: ${root}`);
    console.error('   Hãy chọn đúng thư mục gốc của dự án (repo chứa locales).');
    process.exit(1);
  }
  return root;
}

/** `<projectRoot>/src/i18n/locales` — the canonical locales directory. */
function resolveLocalesDir(argv) {
  return path.join(resolveProjectRoot(argv), 'src', 'i18n', 'locales');
}

/** `<projectRoot>/src` — scanned by the unused-keys tool. */
function resolveSrcDir(argv) {
  return path.join(resolveProjectRoot(argv), 'src');
}

/**
 * Output directory for a given tool. Prefers `IRL_OUTPUT_DIR` (set once by the
 * TUI so all steps of a pipeline agree), else `<projectRoot>/irl-output/<toolId>`.
 * The directory is created if needed.
 */
function resolveOutputDir(toolId, argv) {
  const base = process.env.IRL_OUTPUT_DIR
    ? path.resolve(process.env.IRL_OUTPUT_DIR)
    : path.join(resolveProjectRoot(argv), 'irl-output', toolId);
  fs.mkdirSync(base, { recursive: true });
  return base;
}

module.exports = {
  resolveProjectRoot,
  resolveLocalesDir,
  resolveSrcDir,
  resolveOutputDir,
};
