/**
 * Discover the available tools by scanning `tools/<tool>/irl.config.js`.
 * Each config is a CommonJS module exporting the tool manifest.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// src/ -> ../tools
const TOOLS_DIR = path.resolve(__dirname, '..', 'tools');

export function discoverTools() {
  if (!fs.existsSync(TOOLS_DIR)) return [];

  const dirs = fs
    .readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);

  const tools = [];
  for (const name of dirs) {
    const cfgPath = path.join(TOOLS_DIR, name, 'irl.config.js');
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const cfg = require(cfgPath);
      const toolDir = path.join(TOOLS_DIR, name);
      tools.push({
        ...cfg,
        dir: toolDir,
        entryPath: path.join(toolDir, cfg.entry),
      });
    } catch (err) {
      // A broken config shouldn't take down the whole menu.
      tools.push({
        id: name,
        title: name,
        description: `⚠️ Lỗi đọc irl.config.js: ${err.message}`,
        broken: true,
        inputs: [],
      });
    }
  }

  // Explicit `order` (ascending) decides menu position; fall back to title.
  tools.sort((a, b) => {
    const oa = a.order ?? 999;
    const ob = b.order ?? 999;
    if (oa !== ob) return oa - ob;
    return String(a.title).localeCompare(String(b.title));
  });
  return tools;
}
