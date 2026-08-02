/**
 * Path helpers for drag-and-drop input.
 *
 * When you drag a file/folder into a terminal it inserts the path in a
 * shell-escaped form: it may be wrapped in single/double quotes, have spaces
 * escaped with backslashes (macOS Terminal / iTerm), and carry a trailing
 * space. These helpers normalise that back into a real filesystem path.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

/** Normalise a dragged/pasted path string into a real path. */
export function sanitizeDraggedPath(raw) {
  let s = (raw || '').trim();
  if (!s) return '';

  // Strip a single pair of surrounding matching quotes.
  if (
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2) ||
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2)
  ) {
    s = s.slice(1, -1);
  } else {
    // Unescape shell-escaped characters (e.g. "My\ File.xlsx" -> "My File.xlsx").
    // Only relevant for unquoted paths; on macOS drag produces POSIX paths.
    s = s.replace(/\\(.)/g, '$1');
  }

  s = s.trim();

  // Expand a leading ~ to the home directory.
  if (s === '~') return os.homedir();
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2));

  return s;
}

/** Return an error message (Vietnamese) if the path is invalid, else null. */
export function validatePath(p, type) {
  if (!fs.existsSync(p)) return 'Đường dẫn không tồn tại';
  const st = fs.statSync(p);
  if (type === 'folder' && !st.isDirectory()) return 'Đây không phải là thư mục';
  if (type === 'file' && !st.isFile()) return 'Đây không phải là file';
  return null;
}

/**
 * Resolve a raw draft value for a given input definition and validate it.
 * Returns { value } on success or { error } on failure.
 */
export function resolveAndValidate(input, draft) {
  let v = draft;

  // Fall back to the default when left blank.
  if ((v == null || v === '') && input.default != null) v = input.default;

  if (v == null || v === '') {
    if (input.required) return { error: 'Bắt buộc nhập giá trị' };
    return { value: '' };
  }

  if (input.type === 'file' || input.type === 'folder') {
    v = sanitizeDraggedPath(v);
    const err = validatePath(v, input.type);
    if (err) return { error: err };
    v = path.resolve(v);

    // Project-root inputs must actually be the app repo.
    if (input.name === 'projectRoot') {
      const localesPath = path.join(v, 'src', 'i18n', 'locales');
      if (!fs.existsSync(localesPath)) {
        return { error: 'Thư mục dự án không hợp lệ (thiếu src/i18n/locales)' };
      }
    }
  }

  return { value: v };
}
