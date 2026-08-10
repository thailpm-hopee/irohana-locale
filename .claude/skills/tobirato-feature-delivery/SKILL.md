---
name: tobirato-feature-delivery
description: "End-to-end workflow to deliver a Tobirato screen/feature in an isolated git worktree: set up, mirror an existing module, implement as ONE commit, validate locally (typecheck/lint/build/API/e2e), get a code-review subagent to review and fix, pause for a human manual test, then push and open a PR with gh-tok, watch CI, and recover from failures. Use when asked to implement, build or ship a screen or feature, open a PR, fix a red CI run (design-token lint, manual screenshot manifest, flaky e2e), rebase a conflicting PR, or track CI status to a file. Prefers spawning subagents for result-only work (design extraction, review, log analysis)."
version: 1.0.0
---

# Tobirato feature delivery

Deliver a screen/feature the way this repo expects: isolated worktree, one clean
commit, subagent-driven review, human-gated manual test, PR via `gh-tok`, and CI
watched to green. Each phase links a reference — load only what the current step
needs (progressive disclosure).

## Non-negotiables (enforced, not advice)

- **No commit until the user approves the manual test.** Implement and code-review
  on the **uncommitted working tree** (the reviewer reads `git diff origin/main`,
  not `git show HEAD`); fixes edit files in place — no commit/amend churn while the
  work is still under review. Commit **once**, only after the explicit "continue",
  and it stays one commit until the PR opens. Once the PR is open / receiving
  comments, **fix with NEW commits + plain `git push`** — never amend or force-push
  a branch a reviewer is looking at; a human squashes on merge.
- **Verify before you act on any finding** — a code-review finding, a lint
  complaint, or the user's feedback can be wrong. Re-read the code/design/task and
  confirm the issue is real before changing anything; if it is not, say so instead
  of "fixing" it.
- **Green locally before you push — a push spends CI minutes.** CI fires on every
  push to a PR branch; a failure catchable locally wastes shared-runner time AND
  forces a re-push round-trip. Before the FIRST push and before EVERY re-push, pass
  the full pre-push CI-parity gate (pr-and-ci.md). Cheap deterministic gates
  (lint/typecheck/build/`lint:tokens`/`lint:manual`/web-unit) run FULLY locally — no
  exceptions; heavy DB/browser suites stay scoped per CLAUDE.md, so CI is their first
  full run by design, not a gap to close locally.
- **Conflicts after the PR is open: `git merge origin/main`** (a merge commit),
  **never rebase / force-push.**
- **Never commit unrelated files/lines** — port-config edits and `plans/` stay
  local/uncommitted.
- **PRs via `gh-tok`** (not `gh`), body `Closes #<n>`, base `main`. **Never
  self-merge** — a human merges once checks are green.
- **Prefer subagents** for result-only work (see
  [references/subagents.md](references/subagents.md)).

## Workflow

1. **Set up the worktree + test DB** — [references/worktree-setup.md](references/worktree-setup.md)
2. **Clarify (if ambiguous) → plan (`/plan:fast` or `/plan`) → implement → validate locally → capture the design-fidelity screenshot** — [references/implement-validate.md](references/implement-validate.md)
3. **Code-review on the working tree** (subagent → verify each finding → triage → fix in place → re-review — NO commit yet) — [references/code-review.md](references/code-review.md)
4. **STOP: hand off for the user's manual test** (hand over the captured screenshot to eyeball vs the design, copy port-config, reseed, give `pnpm dev`), wait for explicit "continue" — see code-review.md, "Manual test gate".
5. **Commit once, pass the pre-push CI-parity gate, then push + open the PR, watch CI** — [references/pr-and-ci.md](references/pr-and-ci.md)
6. **On a red run or review comments**, fix with a NEW commit + `git push` (merge
   `origin/main` on conflict — never rebase/force-push once the PR is open) —
   [references/ci-failures.md](references/ci-failures.md)

## CI watcher script

Track a PR's CI to a markdown file (run in the background):

```bash
node .claude/skills/tobirato-feature-delivery/scripts/ci-watch.mjs \
  --repo LogioOne/tobirato --branch <branch> --out plans/reports/ci-tracking-<branch>.md
```

Polls the newest run for the branch, appends a timestamped status row per poll,
and prints `CI_DONE conclusion=<x> run=<id>` on completion. Defaults resolve from
env (`scripts/.env.example`); `--gh gh` switches off the PAT wrapper. Tests:
`node --test scripts/ci-watch.test.mjs`.
