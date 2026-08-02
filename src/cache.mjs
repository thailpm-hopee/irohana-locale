/**
 * Tiny JSON cache so the TUI can remember the last value of each cacheable
 * input per tool (e.g. the project folder, the last Excel file). Improves UX:
 * on the next run the user just presses Enter to reuse the previous path.
 *
 * Stored at $XDG_CONFIG_HOME/irohana-locale/cache.json (or ~/.config/...).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, 'irohana-locale')
  : path.join(os.homedir(), '.config', 'irohana-locale');

const CACHE_FILE = path.join(CONFIG_DIR, 'cache.json');

export function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function getCached(toolId, inputName) {
  const cache = loadCache();
  return cache?.[toolId]?.[inputName];
}

export function setCached(toolId, inputName, value) {
  const cache = loadCache();
  cache[toolId] = cache[toolId] || {};
  cache[toolId][inputName] = value;
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch {
    // Non-fatal — caching is a convenience, not a requirement.
  }
}

export { CACHE_FILE };
