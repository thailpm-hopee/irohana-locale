/**
 * irl TUI — interactive launcher for the irohana localization tools.
 *
 * Screens: menu → collect inputs → running (streaming logs) → done.
 * All UI strings are Vietnamese.
 */
import { render, Box, Text, useInput } from 'ink';
import { useState, useEffect, useRef } from 'react';
import { html } from './html.mjs';
import { discoverTools } from './discover.mjs';
import { getCached, setCached } from './cache.mjs';
import { resolveAndValidate } from './paths.mjs';
import { runTool, buildInvocation } from './runner.mjs';

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
 *
 * The parent owns the text (value/onChange); the cursor is local. Give the
 * component a stable `key` per input so cursor + undo history reset per field.
 */
export function TextField({ value, onChange, onSubmit }) {
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

    // ── delete word before cursor: Ctrl+W / Option+Backspace ────────
    if (
      (key.ctrl && input === 'w') ||
      input === '\x17' ||
      (key.meta && (key.backspace || key.delete))
    ) {
      const start = wordStart(value, cursor);
      edit(value.slice(0, start) + value.slice(cursor), start);
      return;
    }

    // ── delete word after cursor: Alt+D ─────────────────────────────
    if (key.meta && input === 'd') {
      const end = wordEnd(value, cursor);
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

    // Ignore any other control/meta/navigation chords (Ctrl+C handled by Ink).
    if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.tab) {
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
function SelectList({ items, initialIndex = 0, onSelect }) {
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

// ── input helpers ───────────────────────────────────────────────────────────

/** Initial draft for an input: last cached value (if cacheable) else default. */
function initialDraft(tool, input) {
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

function MenuScreen({ tools, onPick }) {
  const items = tools.map((t) => ({
    value: t.id,
    label: t.title,
    description: t.description,
  }));
  return html`
    <${Box} flexDirection="column">
      <${Header} />
      <${Text} bold>Chọn công cụ:<//>
      <${Box} marginTop=${1}>
        <${SelectList} items=${items} onSelect=${(it, i) => onPick(tools[i])} />
      <//>
      <${Box} marginTop=${1}>
        <${Text} color="gray">↑/↓ di chuyển · Enter chọn · Ctrl+C thoát<//>
      <//>
    <//>
  `;
}

function InputScreen({ tool, input, index, total, draft, error, onChange, onSubmit, onSelect }) {
  const cached = input.cache ? getCached(tool.id, input.name) : undefined;

  return html`
    <${Box} flexDirection="column">
      <${Header} />
      <${Text} color="magenta" bold>▶ ${tool.title}<//>
      <${Box} marginTop=${1}>
        <${Text}>Bước nhập ${index + 1}/${total}: <${Text} bold>${input.label}<//><//>
      <//>
      ${input.hint ? html`<${Text} color="gray">${input.hint}<//>` : null}
      ${cached != null && input.type !== 'select'
        ? html`<${Text} color="yellow">Đã lưu lần trước: ${String(cached)} (Enter để dùng lại)<//>`
        : null}

      <${Box} marginTop=${1}>
        ${input.type === 'select'
          ? html`<${SelectList}
              items=${input.choices}
              initialIndex=${Math.max(
                0,
                input.choices.findIndex((c) => c.value === (cached ?? input.default))
              )}
              onSelect=${(it) => onSelect(it.value)}
            />`
          : html`<${Box}>
              <${Text} color="green">❯ <//>
              <${TextField} key=${input.name} value=${draft} onChange=${onChange} onSubmit=${onSubmit} />
            <//>`}
      <//>

      ${error ? html`<${Box} marginTop=${1}><${Text} color="red">✖ ${error}<//><//>` : null}

      <${Box} marginTop=${1}>
        <${Text} color="gray">
          ${input.type === 'select'
            ? '↑/↓ chọn · Enter xác nhận'
            : '←/→ · Ctrl+A/E đầu/cuối · Ctrl+W/Option+Delete xoá từ · Ctrl+U xoá dòng · Ctrl+Z hoàn tác · Enter xác nhận'}
        <//>
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
  const childRef = useRef(null);

  const appendLog = (line) => setLogs((prev) => [...prev, line]);

  function pickTool(t) {
    if (t.broken) return;
    setTool(t);
    setValues({});
    setError(null);
    if (t.inputs.length === 0) {
      startRun(t, {});
      return;
    }
    setIndex(0);
    setDraft(initialDraft(t, t.inputs[0]));
    setScreen('input');
  }

  function commitValue(input, value) {
    const nextValues = { ...values, [input.name]: value };
    setValues(nextValues);
    if (input.cache) setCached(tool.id, input.name, value);

    const nextIndex = index + 1;
    if (nextIndex < tool.inputs.length) {
      setIndex(nextIndex);
      setError(null);
      setDraft(initialDraft(tool, tool.inputs[nextIndex]));
      setScreen('input');
    } else {
      startRun(tool, nextValues);
    }
  }

  function submitDraft() {
    const input = tool.inputs[index];
    const { value, error: err } = resolveAndValidate(input, draft);
    if (err) {
      setError(err);
      return;
    }
    commitValue(input, value);
  }

  function selectChoice(input, value) {
    commitValue(input, value);
  }

  function startRun(t, collected) {
    setLogs([]);
    setStatus('running');
    setScreen('running');
    const { env, args } = buildInvocation(t, collected);
    childRef.current = runTool({
      entryPath: t.entryPath,
      cwd: t.dir,
      args,
      env,
      onLine: appendLog,
      onExit: (code) => {
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
    return html`<${MenuScreen} tools=${tools} onPick=${pickTool} />`;
  }
  if (screen === 'input') {
    const input = tool.inputs[index];
    return html`<${InputScreen}
      tool=${tool}
      input=${input}
      index=${index}
      total=${tool.inputs.length}
      draft=${draft}
      error=${error}
      onChange=${setDraft}
      onSubmit=${submitDraft}
      onSelect=${(value) => selectChoice(input, value)}
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
