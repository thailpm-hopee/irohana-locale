/**
 * irl TUI — interactive launcher for the irohana localization tools.
 *
 * Screens: menu → collect inputs → running (streaming logs) → done.
 * All UI strings are Vietnamese.
 */
import { render, Box, Text, useInput } from 'ink';
import { useState, useEffect, useRef } from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { html } from './html.mjs';
import { discoverTools } from './discover.mjs';
import { getCached, setCached } from './cache.mjs';
import { resolveAndValidate } from './paths.mjs';
import { runTool, buildInvocation } from './runner.mjs';
import { loadSettings, saveSettings } from './settings.mjs';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const MAX_LOG_LINES = 18;

// ── small components ────────────────────────────────────────────────────────

function Spinner() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % SPINNER_FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return html`<${Text} color="cyan">${SPINNER_FRAMES[i]}<//>`;
}

/** Index where the word before `pos` starts (skip whitespace, then the word). */
export function wordStart(s, pos) {
  let i = pos;
  while (i > 0 && /\s/.test(s[i - 1])) i--;
  while (i > 0 && !/\s/.test(s[i - 1])) i--;
  return i;
}

/** Index just after the word following `pos` (skip whitespace, then the word). */
export function wordEnd(s, pos) {
  let i = pos;
  while (i < s.length && /\s/.test(s[i])) i++;
  while (i < s.length && !/\s/.test(s[i])) i++;
  return i;
}

const isWordChar = (ch) => /\w/.test(ch); // [A-Za-z0-9_]

/**
 * Start of the "segment" before `pos`: a single maximal run of the same class
 * of characters (word-chars vs separators). So separators like `/`, `.`, `-`
 * are boundaries and a path is trimmed one piece at a time, e.g.
 * "a/b/c" → "a/b/" → "a/b" → "a/" → "a".
 */
export function segmentStart(s, pos) {
  if (pos <= 0) return 0;
  const wordClass = isWordChar(s[pos - 1]);
  let i = pos;
  while (i > 0 && isWordChar(s[i - 1]) === wordClass) i--;
  return i;
}

/** End of the "segment" after `pos` (mirror of segmentStart, moving forward). */
export function segmentEnd(s, pos) {
  if (pos >= s.length) return s.length;
  const wordClass = isWordChar(s[pos]);
  let i = pos;
  while (i < s.length && isWordChar(s[i]) === wordClass) i++;
  return i;
}

/**
 * Controlled single-line text input with a movable cursor — behaves like a
 * standard terminal (readline/emacs) line editor:
 *   - ←/→ move cursor · Ctrl+B/Ctrl+F move cursor
 *   - Ctrl+A start of line · Ctrl+E end of line
 *   - Backspace delete char before cursor · Ctrl+D / forward-Delete delete char at cursor
 *   - Ctrl+W or Option(Alt)+Delete → delete the word before the cursor
 *   - Alt+D → delete the word after the cursor
 *   - Ctrl+U → delete the whole line · Ctrl+K → delete from cursor to end
 *   - Ctrl+Z → undo the last edit (restore just-deleted / typed characters)
 *   - ↑ (Up) → refill the field with its default / last-saved value
 *
 * The parent owns the text (value/onChange); the cursor is local. Give the
 * component a stable `key` per input so cursor + undo history reset per field.
 */
export function TextField({ value, onChange, onSubmit, defaultValue, onBack }) {
  const [rawCursor, setCursor] = useState(value.length);
  const historyRef = useRef([]);
  const cursor = Math.min(Math.max(rawCursor, 0), value.length);

  // Apply an edit (new text + new cursor), remembering the old state for undo.
  const edit = (nextValue, nextCursor) => {
    historyRef.current.push({ value, cursor });
    if (historyRef.current.length > 500) historyRef.current.shift();
    setCursor(nextCursor);
    onChange(nextValue);
  };

  useInput((input, key) => {
    if (key.return) {
      onSubmit();
      return;
    }

    // Undo the last edit (bring back characters cleared/typed): Ctrl+Z.
    if ((key.ctrl && input === 'z') || input === '\x1a') {
      const prev = historyRef.current.pop();
      if (prev) {
        setCursor(prev.cursor);
        onChange(prev.value);
      }
      return;
    }

    // ── refill with default / last-saved value: Up arrow ────────────
    if (key.upArrow) {
      if (defaultValue != null && defaultValue !== value) {
        edit(defaultValue, defaultValue.length);
      }
      return;
    }

    // ── cursor movement ─────────────────────────────────────────────
    if (key.leftArrow || (key.ctrl && input === 'b')) {
      setCursor(Math.max(0, cursor - 1));
      return;
    }
    if (key.rightArrow || (key.ctrl && input === 'f')) {
      setCursor(Math.min(value.length, cursor + 1));
      return;
    }
    if (key.ctrl && input === 'a') {
      setCursor(0);
      return;
    }
    if (key.ctrl && input === 'e') {
      setCursor(value.length);
      return;
    }

    // ── delete whole line: Ctrl+U ───────────────────────────────────
    if ((key.ctrl && input === 'u') || input === '\x15') {
      edit('', 0);
      return;
    }

    // ── delete to end of line: Ctrl+K ───────────────────────────────
    if (key.ctrl && input === 'k') {
      edit(value.slice(0, cursor), cursor);
      return;
    }

    // ── delete word before cursor, whitespace-delimited: Ctrl+W ─────
    // Like a terminal's unix-word-rubout: deletes back to the previous space
    // (so a path with no spaces is removed in one go).
    if ((key.ctrl && input === 'w') || input === '\x17') {
      const start = wordStart(value, cursor);
      edit(value.slice(0, start) + value.slice(cursor), start);
      return;
    }

    // ── delete one segment before cursor: Option/Alt+Delete ─────────
    // Separators (/, ., -, space, …) are boundaries, so "a/b/c" is trimmed
    // one piece at a time: c → / → b → / → a.
    if (key.meta && (key.backspace || key.delete)) {
      const start = segmentStart(value, cursor);
      edit(value.slice(0, start) + value.slice(cursor), start);
      return;
    }

    // ── delete one segment after cursor: Alt+D ──────────────────────
    if (key.meta && input === 'd') {
      const end = segmentEnd(value, cursor);
      edit(value.slice(0, cursor) + value.slice(end), cursor);
      return;
    }

    // ── delete char before cursor: Backspace ────────────────────────
    if (key.backspace || input === '\x7f' || input === '\x08') {
      if (cursor > 0) edit(value.slice(0, cursor - 1) + value.slice(cursor), cursor - 1);
      return;
    }

    // ── delete char at cursor: forward-Delete / Ctrl+D ──────────────
    if (key.delete || (key.ctrl && input === 'd')) {
      if (cursor < value.length) edit(value.slice(0, cursor) + value.slice(cursor + 1), cursor);
      return;
    }

    // Go back to the previous step: Esc.
    if (key.escape) {
      onBack?.();
      return;
    }

    // Ignore any other control/meta/navigation chords (Ctrl+C handled by Ink).
    if (key.ctrl || key.meta || key.upArrow || key.downArrow || key.tab) {
      return;
    }

    // ── insert typed / pasted / dragged text at the cursor ──────────
    if (input) {
      edit(value.slice(0, cursor) + input + value.slice(cursor), cursor + input.length);
    }
  });

  // Render with a block cursor at its position.
  const before = value.slice(0, cursor);
  const at = value.slice(cursor, cursor + 1) || ' ';
  const after = value.slice(cursor + 1);
  return html`<${Text}>${before}<${Text} inverse>${at}<//>${after}<//>`;
}

/** Vertical selectable list. items: [{label, value, description?}] */
function SelectList({ items, initialIndex = 0, onSelect, onBack }) {
  const [idx, setIdx] = useState(
    Math.min(Math.max(initialIndex, 0), Math.max(items.length - 1, 0))
  );

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setIdx((i) => (i - 1 + items.length) % items.length);
    } else if (key.downArrow || input === 'j') {
      setIdx((i) => (i + 1) % items.length);
    } else if (key.return) {
      onSelect(items[idx], idx);
    } else if (key.escape && onBack) {
      onBack();
    }
  });

  return html`
    <${Box} flexDirection="column">
      ${items.map((it, i) => {
        const active = i === idx;
        return html`
          <${Box} key=${it.value ?? i} flexDirection="column">
            <${Text} color=${active ? 'cyan' : undefined} bold=${active}>
              ${active ? '❯ ' : '  '}${it.label}
            <//>
            ${it.description
              ? html`<${Text} color="gray">     ${it.description}<//>`
              : null}
          <//>
        `;
      })}
    <//>
  `;
}

/** Tri-state of the "All" row given the choices and current selection. */
export function multiAllState(choices, selected) {
  const set = new Set(selected);
  const n = choices.filter((c) => set.has(c.value)).length;
  return n === 0 ? 'none' : n === choices.length ? 'all' : 'some';
}

/** Next selection when the "All" row is toggled: all→none, else→all. */
export function multiToggleAll(choices, selected) {
  return multiAllState(choices, selected) === 'all' ? [] : choices.map((c) => c.value);
}

/**
 * Multi-select checkbox list with a leading "Tất cả" (All) row for quick
 * select-all / deselect-all. `choices`: [{label, value}]; `selected`: the array
 * of chosen values (owned by the parent). Space toggles the row under the
 * cursor; Enter submits.
 *
 * The All row is tri-state: [ ] none · [~] some (intermediate) · [x] all.
 * Toggling it deselects everything when already all-selected, otherwise selects
 * everything. Row 0 is the All row; rows 1..N are the individual languages.
 */
function MultiSelectList({ choices, selected, onToggle, onSubmit, onBack }) {
  const [idx, setIdx] = useState(0);
  const selectedSet = new Set(selected);
  const hasBack = !!onBack;
  const backIdx = choices.length + 1; // after All(0) + langs(1..N)
  const rowCount = choices.length + 1 + (hasBack ? 1 : 0);

  const selCount = choices.filter((c) => selectedSet.has(c.value)).length;
  const allState = multiAllState(choices, selected);

  useInput((input, key) => {
    if (choices.length === 0) {
      if (key.return) onSubmit();
      else if (key.escape && onBack) onBack();
      return;
    }
    if (key.upArrow || input === 'k') {
      setIdx((i) => (i - 1 + rowCount) % rowCount);
    } else if (key.downArrow || input === 'j') {
      setIdx((i) => (i + 1) % rowCount);
    } else if (key.escape && onBack) {
      onBack();
    } else if (input === ' ') {
      if (hasBack && idx === backIdx) {
        onBack();
      } else if (idx === 0) {
        // All row: collapse to none when everything is on, else select all.
        onToggle(multiToggleAll(choices, selected));
      } else {
        const v = choices[idx - 1].value;
        const next = new Set(selectedSet);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        // Emit in choice order so the list stays stable/deterministic.
        onToggle(choices.filter((c) => next.has(c.value)).map((c) => c.value));
      }
    } else if (key.return) {
      if (hasBack && idx === backIdx) onBack();
      else onSubmit();
    }
  });

  if (choices.length === 0) {
    return html`<${Text} color="gray">(không phát hiện ngôn ngữ — Enter để tiếp tục)<//>`;
  }

  const allGlyph = allState === 'all' ? '[x]' : allState === 'some' ? '[~]' : '[ ]';
  const allActive = idx === 0;

  return html`
    <${Box} flexDirection="column">
      <${Text} color=${allActive ? 'cyan' : 'gray'} bold=${allActive}>
        ${allActive ? '❯ ' : '  '}${allGlyph} Tất cả (${selCount}/${choices.length})
      <//>
      ${choices.map((c, i) => {
        const active = idx === i + 1;
        const on = selectedSet.has(c.value);
        return html`
          <${Text} key=${c.value} color=${active ? 'cyan' : undefined} bold=${active}>
            ${active ? '❯ ' : '  '}${on ? '[x]' : '[ ]'} ${c.label}
          <//>
        `;
      })}
      ${hasBack
        ? html`<${Text} color=${idx === backIdx ? 'cyan' : 'gray'} bold=${idx === backIdx}>
            ${idx === backIdx ? '❯ ' : '  '}← Quay lại bước trước
          <//>`
        : null}
    <//>
  `;
}

// ── input helpers ───────────────────────────────────────────────────────────

/** Resolve an input's choices, which may be a function of the collected values. */
function resolveChoices(input, values) {
  return typeof input.choices === 'function'
    ? input.choices(values) || []
    : input.choices || [];
}

/** Human-readable display of a committed value, for the prior-steps summary. */
function displayValue(input, val, values) {
  if (input.type === 'select') {
    const c = resolveChoices(input, values).find((x) => x.value === val);
    return c ? c.label : String(val);
  }
  if (input.type === 'multiselect') {
    const chs = resolveChoices(input, values);
    const arr = Array.isArray(val) ? val : [];
    if (arr.length === 0) return '(không có)';
    return arr.map((v) => (chs.find((x) => x.value === v) || {}).label || v).join(', ');
  }
  return String(val);
}

/**
 * Index of the next input to display at/after `from` whose `when(values)`
 * predicate passes (inputs with no `when` are always shown). Returns
 * tool.inputs.length when there are no more inputs to show → time to run.
 */
function nextVisibleIndex(tool, from, values) {
  for (let i = from; i < tool.inputs.length; i++) {
    const inp = tool.inputs[i];
    if (!inp.when || inp.when(values)) return i;
  }
  return tool.inputs.length;
}

/** Initial draft for an input: last cached value (if cacheable) else default. */
function initialDraft(tool, input, values = {}) {
  // Multiselect draft is an array of selected values.
  if (input.type === 'multiselect') {
    const all = resolveChoices(input, values).map((c) => c.value);
    if (input.cache) {
      const cached = getCached(tool.id, input.name);
      if (Array.isArray(cached)) {
        const keep = cached.filter((v) => all.includes(v)); // drop stale codes
        if (keep.length > 0) return keep;
      }
    }
    return input.default === 'all' ? all : [];
  }

  if (input.cache) {
    const cached = getCached(tool.id, input.name);
    if (cached != null) return String(cached);
  }
  return input.default != null ? String(input.default) : '';
}

// ── screens ─────────────────────────────────────────────────────────────────

function Header() {
  return html`
    <${Box} flexDirection="column" marginBottom=${1}>
      <${Text} color="magenta" bold>  irohana-locale (irl) — công cụ địa phương hoá<//>
      <${Text} color="gray">  Chọn công cụ, kéo-thả file/thư mục vào terminal, xem log trực tiếp.<//>
    <//>
  `;
}

function MenuScreen({ tools, onPick, onSettings }) {
  const items = [
    ...tools.map((t) => ({ value: t.id, label: t.title, description: t.description })),
    {
      value: '__settings',
      label: '⚙ Cài đặt',
      description: 'Bật/tắt công cụ hiển thị · tuỳ chọn ghi file kết quả.',
    },
  ];
  return html`
    <${Box} flexDirection="column">
      <${Header} />
      <${Text} bold>Chọn công cụ:<//>
      <${Box} marginTop=${1}>
        <${SelectList}
          items=${items}
          onSelect=${(it) =>
            it.value === '__settings' ? onSettings() : onPick(tools.find((t) => t.id === it.value))}
        />
      <//>
      ${tools.length === 0
        ? html`<${Box} marginTop=${1}><${Text} color="yellow">Chưa có công cụ nào được bật — vào Cài đặt để bật.<//><//>`
        : null}
      <${Box} marginTop=${1}>
        <${Text} color="gray">↑/↓ di chuyển · Enter chọn · Ctrl+C thoát<//>
      <//>
    <//>
  `;
}

function SettingsScreen({ tools, settings, onChange, onDone }) {
  // Flat list of interactive rows.
  const actions = [
    { kind: 'keepReports' },
    ...tools.map((t) => ({ kind: 'tool', id: t.id, title: t.title })),
    { kind: 'back' },
  ];
  const [idx, setIdx] = useState(0);

  const isEnabled = (id) => !settings.disabledTools.includes(id);
  const enabledCount = tools.filter((t) => isEnabled(t.id)).length;

  function activate() {
    const a = actions[idx];
    if (a.kind === 'keepReports') {
      onChange({ ...settings, keepReports: !settings.keepReports });
    } else if (a.kind === 'tool') {
      const disabled = new Set(settings.disabledTools);
      if (disabled.has(a.id)) {
        disabled.delete(a.id);
      } else {
        if (enabledCount <= 1) return; // keep at least one tool enabled
        disabled.add(a.id);
      }
      onChange({ ...settings, disabledTools: [...disabled] });
    } else {
      onDone();
    }
  }

  useInput((input, key) => {
    if (key.upArrow || input === 'k') setIdx((i) => (i - 1 + actions.length) % actions.length);
    else if (key.downArrow || input === 'j') setIdx((i) => (i + 1) % actions.length);
    else if (key.return || input === ' ') activate();
    else if (key.escape) onDone();
  });

  const checkbox = (on) => (on ? '[x]' : '[ ]');
  const row = (active, text, color) =>
    html`<${Text} color=${active ? 'cyan' : color} bold=${active}>${active ? '❯ ' : '  '}${text}<//>`;

  let cursor = 0;
  const keepReportsRow = row(
    idx === cursor++,
    `${checkbox(settings.keepReports)} Ghi file kết quả/báo cáo cho "Cập nhật i18n từ Excel"`
  );

  return html`
    <${Box} flexDirection="column">
      <${Header} />
      <${Text} color="magenta" bold>⚙ Cài đặt<//>

      <${Box} flexDirection="column" marginTop=${1}>
        ${keepReportsRow}
        <${Text} color="gray">      Tắt: chỉ cập nhật file locale, không tạo thư mục irl-output.<//>
      <//>

      <${Box} flexDirection="column" marginTop=${1}>
        <${Text} bold>Công cụ hiển thị trong menu:<//>
        ${tools.map((t) =>
          row(idx === cursor++, `${checkbox(isEnabled(t.id))} ${t.title}`)
        )}
      <//>

      <${Box} marginTop=${1}>
        ${row(idx === cursor++, '← Lưu & quay lại menu')}
      <//>

      <${Box} marginTop=${1}>
        <${Text} color="gray">↑/↓ di chuyển · Enter/Space bật-tắt · Esc quay lại<//>
      <//>
    <//>
  `;
}

function InputScreen({ tool, input, choices, index, total, draft, defaultDraft, answered, canGoBack, error, onChange, onSubmit, onSelect, onToggle, onBack }) {
  const cached = input.cache ? getCached(tool.id, input.name) : undefined;
  const showCached = cached != null && input.type !== 'select' && input.type !== 'multiselect';

  const backHint = canGoBack ? ' · Esc quay lại' : '';
  const hint =
    (input.type === 'select'
      ? '↑/↓ chọn · Enter xác nhận'
      : input.type === 'multiselect'
        ? '↑/↓ di chuyển · Space bật/tắt · Enter xác nhận'
        : '←/→ · Ctrl+A/E đầu/cuối · Ctrl+W xoá từ · Ctrl+U xoá dòng · Ctrl+Z hoàn tác · ↑ điền lại giá trị mặc định · Enter') +
    backHint;

  // A trailing "← Quay lại" item for list inputs (select), when a back step exists.
  const selectItems = canGoBack ? [...choices, { value: '__back', label: '← Quay lại bước trước' }] : choices;

  return html`
    <${Box} flexDirection="column">
      <${Header} />
      <${Text} color="magenta" bold>▶ ${tool.title}<//>

      ${answered && answered.length
        ? html`<${Box} flexDirection="column" marginTop=${1}>
            ${answered.map(
              (a, i) =>
                html`<${Text} key=${i} color="gray">  ✓ ${a.label}: <${Text} color="green">${a.text}<//><//>`
            )}
          <//>`
        : null}

      <${Box} marginTop=${1}>
        <${Text}>Bước nhập ${index + 1}/${total}: <${Text} bold>${input.label}<//><//>
      <//>
      ${input.hint ? html`<${Text} color="gray">${input.hint}<//>` : null}
      ${showCached
        ? html`<${Text} color="yellow">Đã lưu lần trước: ${String(cached)} (Enter để dùng lại)<//>`
        : null}

      <${Box} marginTop=${1}>
        ${input.type === 'select'
          ? html`<${SelectList}
              items=${selectItems}
              initialIndex=${Math.max(
                0,
                selectItems.findIndex((c) => c.value === (cached ?? input.default))
              )}
              onSelect=${(it) => (it.value === '__back' ? onBack() : onSelect(it.value))}
              onBack=${canGoBack ? onBack : undefined}
            />`
          : input.type === 'multiselect'
            ? html`<${MultiSelectList}
                choices=${choices}
                selected=${Array.isArray(draft) ? draft : []}
                onToggle=${onToggle}
                onSubmit=${onSubmit}
                onBack=${canGoBack ? onBack : undefined}
              />`
            : html`<${Box}>
                <${Text} color="green">❯ <//>
                <${TextField}
                  key=${input.name}
                  value=${draft}
                  defaultValue=${defaultDraft}
                  onChange=${onChange}
                  onSubmit=${onSubmit}
                  onBack=${canGoBack ? onBack : undefined}
                />
              <//>`}
      <//>

      ${error ? html`<${Box} marginTop=${1}><${Text} color="red">✖ ${error}<//><//>` : null}

      <${Box} marginTop=${1}>
        <${Text} color="gray">${hint}<//>
      <//>
    <//>
  `;
}

function RunningScreen({ tool, logs }) {
  const shown = logs.slice(-MAX_LOG_LINES);
  return html`
    <${Box} flexDirection="column">
      <${Box}>
        <${Spinner} />
        <${Text} bold> Đang chạy: ${tool.title}<//>
      <//>
      <${Box} flexDirection="column" marginTop=${1} borderStyle="round" borderColor="gray" paddingX=${1}>
        ${shown.length === 0
          ? html`<${Text} color="gray">…<//>`
          : shown.map((l, i) => html`<${Text} key=${i} wrap="truncate-end">${l || ' '}<//>`)}
      <//>
    <//>
  `;
}

function DoneScreen({ tool, status, logs }) {
  const ok = status === 'success';
  const tail = logs.slice(-MAX_LOG_LINES);
  return html`
    <${Box} flexDirection="column">
      <${Box}>
        <${Text} color=${ok ? 'green' : 'red'} bold>${ok ? '✔' : '✖'}<//>
        <${Text} bold> ${tool.title} — ${ok ? 'Hoàn tất' : 'Thất bại'}<//>
      <//>
      <${Box} flexDirection="column" marginTop=${1} borderStyle="round" borderColor=${ok ? 'green' : 'red'} paddingX=${1}>
        ${tail.map((l, i) => html`<${Text} key=${i} wrap="truncate-end">${l || ' '}<//>`)}
      <//>
      <${Box} marginTop=${1}>
        <${Text} color="gray">Enter để về menu · Ctrl+C để thoát<//>
      <//>
    <//>
  `;
}

// ── app ─────────────────────────────────────────────────────────────────────

export function App({ tools }) {
  // Ctrl+C exit is handled by Ink automatically (exitOnCtrlC default).
  const [screen, setScreen] = useState('menu'); // menu | input | running | done
  const [tool, setTool] = useState(null);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState({});
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState('running');
  const [settings, setSettings] = useState(loadSettings);
  const childRef = useRef(null);

  const appendLog = (line) => setLogs((prev) => [...prev, line]);

  const enabledTools = tools.filter((t) => !settings.disabledTools.includes(t.id));

  function updateSettings(next) {
    setSettings(next);
    saveSettings(next);
  }

  function pickTool(t) {
    if (t.broken) return;
    setTool(t);
    setValues({});
    setError(null);
    const first = nextVisibleIndex(t, 0, {});
    if (first >= t.inputs.length) {
      startRun(t, {});
      return;
    }
    setIndex(first);
    setDraft(initialDraft(t, t.inputs[first], {}));
    setScreen('input');
  }

  function commitValue(input, value) {
    const nextValues = { ...values, [input.name]: value };
    setValues(nextValues);
    if (input.cache) setCached(tool.id, input.name, value);

    const next = nextVisibleIndex(tool, index + 1, nextValues);
    if (next < tool.inputs.length) {
      setIndex(next);
      setError(null);
      setDraft(initialDraft(tool, tool.inputs[next], nextValues));
      setScreen('input');
    } else {
      startRun(tool, nextValues);
    }
  }

  function submitDraft() {
    const input = tool.inputs[index];
    // Submitting an empty field reuses the default / last-saved value
    // ("Enter để dùng lại"), instead of rejecting it as required.
    let d = draft;
    if (d == null || (typeof d === 'string' && d.trim() === '')) {
      d = initialDraft(tool, input, values);
    }
    const { value, error: err } = resolveAndValidate(input, d);
    if (err) {
      setError(err);
      return;
    }
    commitValue(input, value);
  }

  function selectChoice(input, value) {
    commitValue(input, value);
  }

  /** Return to the previous visible step, restoring its committed value. */
  function goBack() {
    let i = index - 1;
    while (i >= 0 && tool.inputs[i].when && !tool.inputs[i].when(values)) i--;
    if (i < 0) return; // already at the first step
    const prev = tool.inputs[i];
    setIndex(i);
    setError(null);
    const prevVal = values[prev.name];
    setDraft(prevVal != null ? prevVal : initialDraft(tool, prev, values));
    setScreen('input');
  }

  function startRun(t, collected) {
    const { env, args } = buildInvocation(t, collected);
    const initialLogs = [];

    // For tools whose outputs are optional (e.g. i18n-update): unless the user
    // opted to keep reports, route them to a temp dir and delete it afterwards,
    // so the project gets no irl-output folder — only its locale files change.
    let cleanupDir = null;
    if (t.optionalOutputs && !settings.keepReports) {
      cleanupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'irl-out-'));
      env.IRL_OUTPUT_DIR = cleanupDir;
      initialLogs.push('ℹ️  Chế độ gọn: chỉ cập nhật file locale, không tạo thư mục irl-output.');
    }

    setLogs(initialLogs);
    setStatus('running');
    setScreen('running');
    childRef.current = runTool({
      entryPath: t.entryPath,
      cwd: t.dir,
      args,
      env,
      onLine: appendLog,
      onExit: (code) => {
        if (cleanupDir) {
          try {
            fs.rmSync(cleanupDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
        setStatus(code === 0 ? 'success' : 'error');
        setScreen('done');
      },
    });
  }

  // Global "return to menu" on the done screen.
  useInput(
    (input, key) => {
      if (screen === 'done' && key.return) {
        setTool(null);
        setLogs([]);
        setScreen('menu');
      }
    },
    { isActive: screen === 'done' }
  );

  if (screen === 'menu') {
    return html`<${MenuScreen}
      tools=${enabledTools}
      onPick=${pickTool}
      onSettings=${() => setScreen('settings')}
    />`;
  }
  if (screen === 'settings') {
    return html`<${SettingsScreen}
      tools=${tools}
      settings=${settings}
      onChange=${updateSettings}
      onDone=${() => setScreen('menu')}
    />`;
  }
  if (screen === 'input') {
    const input = tool.inputs[index];
    const choices = resolveChoices(input, values);
    // The default/last-saved draft for this step — used by ↑ to refill the field.
    const defaultDraft = initialDraft(tool, input, values);
    // Only count inputs actually shown for the given values, so the "x/y"
    // step counter stays truthful when a conditional step is skipped.
    const visible = tool.inputs.filter((inp) => !inp.when || inp.when(values));
    const pos = visible.indexOf(input);
    // Summary of the answers given in earlier (visible) steps, for tracking.
    const answered = visible
      .slice(0, Math.max(pos, 0))
      .filter((inp) => inp.name in values)
      .map((inp) => ({ label: inp.label, text: displayValue(inp, values[inp.name], values) }));
    return html`<${InputScreen}
      tool=${tool}
      input=${input}
      choices=${choices}
      index=${pos >= 0 ? pos : index}
      total=${visible.length}
      draft=${draft}
      defaultDraft=${defaultDraft}
      answered=${answered}
      canGoBack=${pos > 0}
      error=${error}
      onChange=${setDraft}
      onSubmit=${submitDraft}
      onSelect=${(value) => selectChoice(input, value)}
      onToggle=${setDraft}
      onBack=${goBack}
    />`;
  }
  if (screen === 'running') {
    return html`<${RunningScreen} tool=${tool} logs=${logs} />`;
  }
  return html`<${DoneScreen} tool=${tool} status=${status} logs=${logs} />`;
}

// ── entry ───────────────────────────────────────────────────────────────────

export async function start() {
  if (!process.stdin.isTTY) {
    console.error('❌ irl cần chạy trong terminal tương tác (TTY). Hãy chạy trực tiếp lệnh `irl`.');
    process.exit(1);
  }

  const tools = discoverTools();
  if (tools.length === 0) {
    console.error('❌ Không tìm thấy công cụ nào trong thư mục tools/.');
    process.exit(1);
  }

  const { waitUntilExit } = render(html`<${App} tools=${tools} />`);
  await waitUntilExit();
}
