#!/usr/bin/env node
/**
 * irl — irohana-locale
 *
 * Entry point. Launches the interactive Ink TUI that lists the available
 * localization tools, collects their inputs (drag-and-drop paths, choices)
 * and runs them while streaming logs.
 */
import { start } from '../src/app.mjs';

start().catch((err) => {
  // Fallback for any error thrown before Ink takes over the screen.
  console.error('\n❌ irl gặp lỗi không mong muốn:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
