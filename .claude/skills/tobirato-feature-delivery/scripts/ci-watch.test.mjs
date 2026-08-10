/* Tests for ci-watch helpers. Run: node --test scripts/ci-watch.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, parseEnvFile, loadEnvDefaults, pickRun, statusRow } from './ci-watch.mjs';

test('parseArgs reads --key value and --flag', () => {
  const a = parseArgs(['--repo', 'o/r', '--branch', 'feat', '--verbose']);
  assert.equal(a.repo, 'o/r');
  assert.equal(a.branch, 'feat');
  assert.equal(a.verbose, true);
});

test('parseEnvFile ignores comments/blanks and strips quotes', () => {
  const e = parseEnvFile('# c\nCI_WATCH_REPO="o/r"\n\nCI_WATCH_GH=gh\n');
  assert.equal(e.CI_WATCH_REPO, 'o/r');
  assert.equal(e.CI_WATCH_GH, 'gh');
});

test('loadEnvDefaults: skill .env beats skills .env beats .claude .env, process.env wins', () => {
  const files = {
    '/skill/.env': 'CI_WATCH_REPO=skill/repo',
    '/cwd/.claude/skills/.env': 'CI_WATCH_REPO=skills/repo\nCI_WATCH_GH=gh',
    '/cwd/.claude/.env': 'CI_WATCH_REPO=claude/repo',
  };
  const readers = { exists: (p) => p in files, read: (p) => files[p] };
  const env = loadEnvDefaults('/cwd', '/skill', readers);
  assert.equal(env.CI_WATCH_REPO, 'skill/repo'); // highest-precedence file wins
  assert.equal(env.CI_WATCH_GH, 'gh'); // only defined lower down
});

test('pickRun returns newest run for the branch, or null', () => {
  const json = {
    workflow_runs: [
      { id: 3, head_branch: 'other', status: 'completed' },
      { id: 2, head_branch: 'feat', status: 'in_progress' },
      { id: 1, head_branch: 'feat', status: 'completed' },
    ],
  };
  assert.equal(pickRun(json, 'feat').id, 2);
  assert.equal(pickRun(json, 'missing'), null);
  assert.equal(pickRun({}, 'feat'), null);
});

test('statusRow formats a markdown row, waiting when no run', () => {
  const iso = '2026-08-05T09:11:20.000Z';
  assert.equal(
    statusRow({ id: 42, status: 'in_progress', conclusion: null }, iso),
    '| 09:11:20Z | in_progress | - | 42 |',
  );
  assert.equal(statusRow(null, iso), '| 09:11:20Z | waiting | - | - |');
  assert.equal(
    statusRow({ id: 42, status: 'completed', conclusion: 'success' }, iso),
    '| 09:11:20Z | completed | success | 42 |',
  );
});
