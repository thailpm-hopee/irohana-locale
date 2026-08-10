/**
 * Spawn a tool's entry script and stream its stdout/stderr line-by-line.
 */
import { spawn } from 'child_process';

/**
 * @param {object}   opts
 * @param {string}   opts.entryPath  Absolute path to the tool's entry .js
 * @param {string}   opts.cwd        Working directory (the tool dir)
 * @param {string[]} opts.args       CLI args (already resolved)
 * @param {object}   opts.env        Environment for the child
 * @param {(line:string)=>void} opts.onLine  Called per output line
 * @param {(code:number)=>void} opts.onExit  Called when the process exits
 * @returns {import('child_process').ChildProcess}
 */
export function runTool({ entryPath, cwd, args, env, onLine, onExit }) {
  const child = spawn(process.execPath, [entryPath, ...args], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';
  const handle = (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      onLine(line);
    }
  };

  child.stdout.on('data', handle);
  child.stderr.on('data', handle);

  child.on('error', (err) => {
    onLine(`❌ Không chạy được tiến trình: ${err.message}`);
  });

  child.on('close', (code) => {
    if (buffer.length) {
      onLine(buffer.replace(/\r$/, ''));
      buffer = '';
    }
    onExit(code ?? 0);
  });

  return child;
}

/**
 * Build the { env, args } used to invoke a tool from its collected input values.
 * - pass.kind === 'env'  → set env[key] = value
 * - pass.kind === 'flag' → push `${key}=${value}`
 * - pass.kind === 'arg'  → push value (positional)
 *
 * Array values (multiselect) are joined with commas; an empty array is skipped
 * so the flag is omitted entirely (the tool then applies its own default).
 */
export function buildInvocation(tool, values) {
  const env = { ...process.env };
  const args = [];

  for (const input of tool.inputs) {
    let value = values[input.name];
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      value = value.join(',');
    }
    if (value == null || value === '') continue;

    const pass = input.pass || { kind: 'arg' };
    if (pass.kind === 'env') {
      env[pass.key] = value;
    } else if (pass.kind === 'flag') {
      args.push(`${pass.key}=${value}`);
    } else {
      args.push(value);
    }
  }

  return { env, args };
}
