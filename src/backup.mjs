/**
 * Backup / undo support.
 *
 * Some tools (e.g. i18n-update) overwrite locale files in the project in place.
 * To prevent a mistaken run from destroying work, the TUI snapshots the paths a
 * tool declares in `backup: [...]` (project-relative) BEFORE running it, and
 * offers an "Undo" that restores the most recent snapshot.
 *
 * Snapshots live under the config dir (NOT inside the target repo, so its git
 * tree stays clean). An index maps each snapshot to its tool, time and project.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = process.env.XDG_CONFIG_HOME
  ? path.join(process.env.XDG_CONFIG_HOME, 'irohana-locale')
  : path.join(os.homedir(), '.config', 'irohana-locale');

const BACKUP_ROOT = path.join(CONFIG_DIR, 'backups');
const INDEX_FILE = path.join(CONFIG_DIR, 'backups.json');
const MAX_BACKUPS = 20;

function readIndex() {
  try {
    const arr = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    // Non-fatal; undo is a safety net, not a hard requirement.
  }
}

/**
 * Snapshot a tool's declared paths from the project. Returns the created entry
 * (newest-first index prepended) or null when there is nothing to back up.
 */
export function createBackup(tool, projectRoot) {
  const rels = tool.backup || [];
  if (!rels.length || !projectRoot) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${stamp}_${tool.id}`;
  const dir = path.join(BACKUP_ROOT, id);

  const savedPaths = [];
  for (const rel of rels) {
    const src = path.join(projectRoot, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    savedPaths.push(rel);
  }
  if (savedPaths.length === 0) return null;

  const entry = {
    id,
    toolId: tool.id,
    toolTitle: tool.title,
    projectRoot,
    timestamp: new Date().toISOString(),
    dir,
    paths: savedPaths,
  };

  const list = [entry, ...readIndex()];
  const kept = list.slice(0, MAX_BACKUPS);
  for (const dropped of list.slice(MAX_BACKUPS)) {
    try {
      fs.rmSync(dropped.dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  writeIndex(kept);
  return entry;
}

/** Recent snapshots that still exist on disk, newest first. */
export function listBackups() {
  return readIndex().filter((e) => e && e.dir && fs.existsSync(e.dir));
}

/**
 * Restore a snapshot by copying its files back over the project (overwrite).
 * Returns { restored: number }.
 */
export function restoreBackup(entry) {
  let restored = 0;
  for (const rel of entry.paths) {
    const src = path.join(entry.dir, rel);
    const dest = path.join(entry.projectRoot, rel);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, dest, { recursive: true, force: true });
    restored++;
  }
  return { restored };
}

/** Short, human-friendly label for a backup entry (Vietnamese-ish, local time). */
export function describeBackup(entry) {
  let when = entry.timestamp;
  try {
    when = new Date(entry.timestamp).toLocaleString();
  } catch {
    /* keep ISO */
  }
  const proj = path.basename(entry.projectRoot || '');
  return `${entry.toolTitle} · ${when} · ${proj}`;
}
