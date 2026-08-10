#!/usr/bin/env node
/*
 * Watch a PR branch's CI run and append a tracking log to a markdown file.
 *
 * Polls `<gh> api repos/<repo>/actions/runs` for the newest run on a branch,
 * writes a timestamped row per poll, and exits when the run completes (prints
 * `CI_DONE conclusion=<x> run=<id>`) or after a max number of polls.
 *
 * Usage:
 *   node ci-watch.mjs --repo <owner/repo> --branch <branch> [--out <file>]
 *                     [--interval 30] [--max 100] [--gh gh-tok]
 *
 * Defaults resolve from env (see loadEnvDefaults): CI_WATCH_REPO, CI_WATCH_GH.
 * `<gh>` defaults to `gh-tok` (a gh wrapper carrying a PAT); pass `--gh gh` to
 * use plain gh. The gh CLI provides auth, so this script needs no secrets.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Parse `--key value` / `--flag` argv into an object. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else out[key] = next;
    if (out[key] !== true) i++;
  }
  return out;
}

/** Read KEY=VALUE lines from a .env-style string (ignores comments/blanks). */
export function parseEnvFile(text) {
  const env = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

/**
 * Env defaults, precedence per skill rule:
 *   process.env > .claude/skills/<skill>/.env > .claude/skills/.env > .claude/.env
 * `readers` is injectable for tests: { exists(path), read(path) }.
 */
export function loadEnvDefaults(cwd, skillDir, readers = { exists: existsSync, read: (p) => readFileSync(p, 'utf8') }) {
  const files = [
    resolve(skillDir, '.env'),
    resolve(cwd, '.claude/skills/.env'),
    resolve(cwd, '.claude/.env'),
  ];
  const merged = {};
  // Lowest precedence first, so later assignments (higher precedence) win.
  for (const f of [...files].reverse()) {
    if (readers.exists(f)) Object.assign(merged, parseEnvFile(readers.read(f)));
  }
  return { ...merged, ...process.env };
}

/** The newest workflow run whose head_branch matches, or null. */
export function pickRun(runsJson, branch) {
  const runs = (runsJson && runsJson.workflow_runs) || [];
  const forBranch = runs.filter((r) => r.head_branch === branch);
  // The API returns newest first, so index 0 is the current attempt.
  return forBranch[0] || null;
}

/** A markdown table row for the tracking file. */
export function statusRow(run, nowIso) {
  const ts = nowIso.slice(11, 19) + 'Z';
  const status = run ? run.status : 'waiting';
  const concl = run && run.conclusion ? run.conclusion : '-';
  const id = run ? run.id : '-';
  return `| ${ts} | ${status} | ${concl} | ${id} |`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const skillDir = new URL('..', import.meta.url).pathname;
  const env = loadEnvDefaults(cwd, skillDir);

  const repo = args.repo || env.CI_WATCH_REPO;
  const branch = args.branch;
  const gh = args.gh || env.CI_WATCH_GH || 'gh-tok';
  const interval = Number(args.interval || 30) * 1000;
  const max = Number(args.max || 100);
  const out = args.out || `plans/reports/ci-tracking-${branch}.md`;

  if (!repo || !branch) {
    console.error('Usage: ci-watch.mjs --repo <owner/repo> --branch <branch> [--out <file>]');
    process.exit(2);
  }

  appendFileSync(out, `\n| time (UTC) | status | conclusion | run |\n|---|---|---|---|\n`);
  for (let i = 0; i < max; i++) {
    let run = null;
    try {
      const raw = execFileSync(gh, ['api', `repos/${repo}/actions/runs?per_page=15`], {
        encoding: 'utf8',
      });
      run = pickRun(JSON.parse(raw), branch);
    } catch (err) {
      appendFileSync(out, `| ${new Date().toISOString().slice(11, 19)}Z | error | - | ${String(err.message).slice(0, 40)} |\n`);
    }
    appendFileSync(out, statusRow(run, new Date().toISOString()) + '\n');
    if (run && run.status === 'completed') {
      appendFileSync(out, `\n**CI completed: ${run.conclusion}** — run ${run.id} (${run.html_url})\n`);
      console.log(`CI_DONE conclusion=${run.conclusion} run=${run.id}`);
      return;
    }
    await sleep(interval);
  }
  console.log('CI_TIMEOUT');
}

// Run only as a CLI, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) main();
