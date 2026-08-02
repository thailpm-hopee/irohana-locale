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

/** Delete the previous "word": trailing whitespace, then trailing non-whitespace. */
export function deleteWord(s) {
  let i = s.length;
  while (i > 0 && /\s/.test(s[i - 1])) i--;
  while (i > 0 && !/\s/.test(s[i - 1])) i--;
  return s.slice(0, i);
}

/**
 * Controlled single-line text input.
 * Handles typing, paste/drag, and quick-delete:
 *   - Backspace/Delete → remove one char
 *   - Ctrl+W or Option(Alt)+Delete → delete previous word (whole path if no spaces)
 *   - Ctrl+U (or Cmd+Delete when the terminal maps it to ^U) → clear the line
 */
export function TextField({ value, onChange, onSubmit }) {
  useInput((input, key) => {
    if (key.return) {
      onSubmit();
      return;
    }

    // Clear the entire line: Ctrl+U (0x15). Some terminals map Cmd+Delete here.
    if ((key.ctrl && input === 'u') || input === '\x15') {
      onChange('');
      return;
    }

    // Delete previous word: Ctrl+W (0x17) or Option/Alt+Backspace (meta+backspace).
    if (
      (key.ctrl && input === 'w') ||
      input === '\x17' ||
      (key.meta && (key.backspace || key.delete))
    ) {
      onChange(deleteWord(value));
      return;
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }

    // Ignore remaining control/meta/navigation chords (Ctrl+C handled by Ink).
    if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return;
    }
    if (input) onChange(value + input);
  });

  return html`
    <${Text}>
      ${value}
      <${Text} inverse> <//>
    <//>
  `;
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
              <${TextField} value=${draft} onChange=${onChange} onSubmit=${onSubmit} />
            <//>`}
      <//>

      ${error ? html`<${Box} marginTop=${1}><${Text} color="red">✖ ${error}<//><//>` : null}

      <${Box} marginTop=${1}>
        <${Text} color="gray">
          ${input.type === 'select'
            ? '↑/↓ chọn · Enter xác nhận'
            : 'Enter xác nhận · Ctrl+W/Option+Delete xoá 1 từ · Ctrl+U xoá cả dòng · Ctrl+C thoát'}
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
