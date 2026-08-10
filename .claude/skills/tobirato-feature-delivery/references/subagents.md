# Subagent delegation (result-only work)

Prefer a subagent whenever the main thread only needs the CONCLUSION, not the
intermediate file reads/logs. This keeps the main context lean and parallelizes
independent work. Launch independent subagents in ONE message so they run
concurrently.

## When to delegate

| Work | Subagent | Why |
|---|---|---|
| Extract a design frame + field rules from huge handoff HTML/docs | `Explore` | Reads excerpts, returns the spec; never dump the file into main context |
| Locate patterns across the codebase (which module to mirror) | `Explore` / `scout` | Broad fan-out search, returns file:line conclusions |
| Review the commit diff and FIX defects | `code-reviewer` | Independent, adversarial pass; can apply fixes + re-validate |
| Analyze a large CI failure log | `general-purpose` | Returns the failing step + root cause, not the raw log |
| Parallel implementation of independent phases | `fullstack-developer` | Strict file-ownership, no conflicts |

## How to delegate well

- Give the worktree path, the exact scope (files / commit range), and the
  **deliberate decisions not to flag** — otherwise the agent re-litigates settled
  rulings.
- State the deliverable precisely: "return findings grouped by severity with
  file:line + fix", "return the spec as raw facts", "return the failing step + fix".
- For a reviewer/fixer, say whether it may edit files and whether to commit
  (usually: edit yes, commit no — the main session amends the single commit).
- **Continue** a completed background subagent with `SendMessage` (by its agent id)
  to reuse its context for a follow-up (e.g. re-review the delta) instead of
  spawning a fresh one.
- Relay only what matters — the agent's final message is not shown to the user.

## What NOT to delegate

- The single-commit discipline, staging, amend, push, PR creation, and the CI
  fix→amend→force-push loop stay in the main session (they touch git state that
  must not race a subagent).
