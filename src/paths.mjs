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
 * `values` is the map of already-collected step values, so an input's optional
 * `validate(value, values)` hook can cross-check against earlier answers (e.g.
 * validating the Excel file against the chosen layout).
 *
 * Domain-specific rules live in each tool's `irl.config.js` via `validate`
 * (a Vietnamese error string, or null/undefined when valid) — this keeps
 * paths.mjs generic. Returns { value } on success or { error } on failure.
 */
export function resolveAndValidate(input, draft, values = {}) {
  // Multiselect: draft is an array of chosen values.
  if (input.type === 'multiselect') {
    const arr = Array.isArray(draft) ? draft : [];
    if (input.required && arr.length === 0) {
      return { error: 'Chọn ít nhất 1 ngôn ngữ (Space để bật/tắt)' };
    }
    const verr = runValidate(input, arr, values);
    if (verr) return { error: verr };
    return { value: arr };
  }

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
  }

  // Run the input's own domain validator (if any) against the resolved value.
  const verr = runValidate(input, v, values);
  if (verr) return { error: verr };

  return { value: v };
}

/**
 * Invoke an input's optional `validate(value, values)` hook. Returns the error
 * string it produced, or null when valid. A throw inside the validator is
 * surfaced as an error message rather than crashing the TUI.
 */
function runValidate(input, value, values) {
  if (typeof input.validate !== 'function') return null;
  try {
    return input.validate(value, values) || null;
  } catch (err) {
    return `Không kiểm tra được giá trị: ${err.message}`;
  }
}
