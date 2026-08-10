# Code review (subagent) + manual-test gate

## Review with a subagent (result-only)

The code is **not committed** at this point — spawn a **`code-reviewer` subagent**
over the working-tree diff. Give it enough context to judge, and authorize it to FIX:

- Point it at the worktree path and `git diff origin/main` (working tree, NOT
  `git show HEAD` — there is no feature commit yet).
- Have it check the diff against **both** the task requirements and the screen's
  design/field rules (the frame + definition doc), not just code smells.
- List the **deliberate decisions** it must NOT flag (logical delete, RLS-only,
  no plan cap, columns intentionally off-screen, full-navigation-on-save, etc.).
- Tell it to IGNORE the uncommitted port-config files and `plans/`.
- Ask for findings grouped Critical/High/Medium/Low, each with file:line + concrete
  fix; and to re-run `typecheck/lint/build` + the feature's API + e2e specs after
  any fix. Tell it NOT to commit (nothing is committed yet — leave changes in the
  working tree for the main session).

## Triage the findings

**Verify each finding before acting on it** — the reviewer can be wrong. Re-read the
code / design frame / task and confirm the issue is real; if it is not, record why
and skip it. Do not "fix" a phantom.

- **Fix**: real correctness/security bugs, and any medium/low that is a genuine
  improvement and cheap (a11y on new shared components, dead CSS, missing cleanup).
- **Skip (with reason)**: findings you verified as wrong, and items that only match
  an existing sibling screen's pattern — parity beats a lone deviation. State the
  reason.
- Apply fixes **in the working tree (no commit / no amend)** and **re-review** the
  delta (continue the same reviewer via SendMessage to reuse its context). The
  single commit is still deferred to after the manual-test approval (pr-and-ci.md).

## Second pass

A focused second review of just the delta is enough when the first pass had no
Critical/High. Confirm "nothing big" before proceeding.

## Manual test gate (STOP — do not push yet)

The user tests by hand before anything reaches origin — and the code is still
**uncommitted**. Prepare and hand off:

1. Hand over the captured `docs/manual/assets/SCR-xxx.png` and the design-frame
   reference so the user can eyeball fidelity (implement-validate.md → "Capture the
   design-fidelity screenshot").
2. Copy the port-config into the worktree (uncommitted) so ports match.
3. Reseed for a clean demo: `pnpm --filter @tobirato/api seed`.
4. Give ONE copy-paste command that `cd`s into the worktree by its **absolute**
   path and starts the dev servers — always emit this, even if the path seems
   obvious:
   ```bash
   cd <repo>/.claude/worktrees/<branch> && pnpm dev
   ```
   Use the real absolute path (e.g. `/Users/.../tobirato-2/.claude/worktrees/issue-29-...`),
   not a relative one — the user runs it in a fresh terminal. `pnpm dev`
   (`turbo run dev`) starts web + api together. Then tell them the URL, a seeded
   login email, and the exact screen path/entry point.
5. **Wait for an explicit "continue".** Do not commit, push, or open the PR until
   then.

If they request changes, **verify each request is correct first** (it may be
wrong), then implement in the working tree → (re-review if substantive) → recapture
the screenshot if the UI changed → reseed → hand off again. Still no commit.
