/**
 * Persisted user settings for the TUI, stored next to the cache/backups in the
 * config dir. Currently:
 *   - keepReports: whether tools with optional outputs (i18n-update) leave their
 *     report/output files in the project (`irl-output/`). Default false — the
 *     tool only updates locale files and writes no output folder.
 *   - disabledTools: tool ids hidden from the menu (default: none hidden).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, 'irohana-locale')
  : path.join(os.homedir(), '.config', 'irohana-locale');

const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

const DEFAULTS = {
  keepReports: false,
  disabledTools: [],
};

export function loadSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return {
      ...DEFAULTS,
      ...stored,
      disabledTools: Array.isArray(stored.disabledTools) ? stored.disabledTools : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    // Non-fatal.
  }
}

export { SETTINGS_FILE };
