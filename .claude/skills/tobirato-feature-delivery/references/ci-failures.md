# CI failure playbook

Golden rule (the PR is already open): **fix locally → NEW commit → plain
`git push`.** Never amend/force-push a branch under review. If main advanced or the
PR conflicts, **`git merge origin/main` first** (a merge commit), never rebase.
(Amend + one-commit discipline applies only BEFORE the PR is opened.)

## Read the failure precisely

```bash
gh-tok api repos/LogioOne/tobirato/actions/runs/<id>/jobs \
  --jq '.jobs[] | "\(.name): \(.conclusion)"'                       # which job
gh-tok api repos/LogioOne/tobirato/actions/runs/<id>/jobs \
  --jq '.jobs[].steps[] | select(.conclusion=="failure") | .name'  # which step
gh-tok run view <id> --repo LogioOne/tobirato --log-failed          # the log
```
(`check-runs` may 403 under the PAT; `actions/runs`/jobs work.) Delegate a long log
read to a subagent if it is large — you only need the conclusion + fix.

## Conflicting PR (main advanced) → merge

```bash
git stash push -m port-config <the 3 port files>     # merge needs a clean tree
git fetch origin && git merge origin/main            # resolve conflicts, keep BOTH sides' intent
git add <resolved> && git commit --no-edit           # the merge commit
git stash pop
```
Re-run the full local gauntlet (implement-validate.md), then plain `git push`. A
merge keeps the branch's existing commits intact (no force-push), so a reviewer's
view and the CI watcher (tracks by branch name) both stay stable.

## Design-token lint (`pnpm lint:tokens`)

"Primitive token `--x` without `/* primitive-ok */`" or "raw HEX". Fix: use the
Semantic/Component token, or a kit class (e.g. an outline button → `tbr-btn
tbr-btn--secondary`) instead of hand-rolled primitive colours. Delete the dead
custom CSS. Verify: `pnpm lint:tokens`.

## Manual manifest lint (`pnpm lint:manual`)

"Built screen … `docs/manual/assets/SCR-xxx.png` not committed." Giving a screen a
route made it "built", so it needs a screenshot:

1. Add a capture recipe to `apps/web/e2e/manual-shots.spec.ts` `TARGETS`
   (`path`, and an `expect` string only that screen shows).
2. `pnpm --filter @tobirato/web manual:shots` (captures all built screens).
3. Keep ONLY the new PNG; revert font-rasterization churn to the rest:
   `git checkout -- docs/manual/assets/ && git add docs/manual/assets/SCR-xxx.png`.
4. Stage it (the lint reads the git **index**), verify: `pnpm lint:manual`.

## Test failures

- Run the failing spec in isolation. Passes alone but failed in the full run →
  parallel-load flake, not your change (note it, do not chase it).
- Genuinely failing api/e2e → reproduce against the worktree's own test DB, fix,
  amend.

## Before re-pushing

Re-pass the full pre-push CI-parity gate (pr-and-ci.md) — every gate green, not just
the one that failed — so the next CI run is not a second round-trip for a sibling
check.
