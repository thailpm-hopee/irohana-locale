# Commit, push, open the PR, watch CI

Only after the user says "continue".

## Commit (the first and only commit — now)

The work has been uncommitted through implement + review. Create the single commit
here:

```bash
git add <exact feature paths> docs/manual/assets/SCR-xxx.png   # never `git add -A` blindly
git status --short                       # only feature files staged; port-config stays unstaged
git commit -F - <<'EOF'
<type>(scope): <summary> (SCR-xxx, RD-xx)
... what + why ...

Closes #<n>
EOF
```

If a fix is needed between this commit and opening the PR, `git commit --amend`
(still one commit). After the PR is open, switch to NEW commits + plain push
(ci-failures.md).

## Pre-push CI-parity gate (green before you push — a push spends CI minutes)

Pushing this branch triggers a full CI run (CI fires on every push to a PR branch).
A failure catchable locally wastes shared-runner minutes AND costs a re-push
round-trip, so re-run the gauntlet to green NOW — state may have drifted since
implementation (review fixes, an `origin/main` merge). Re-run every gate in
implement-validate.md → "Local validation gauntlet":

- Cheap deterministic gates run FULLY, no exceptions — they ARE CI job 1 and the
  commonest red-CI causes:
  `pnpm lint:tokens && pnpm lint:manual && pnpm typecheck && pnpm lint && pnpm build`
  then `pnpm exec turbo run test --filter=@tobirato/web`.
- DB/browser suites stay SCOPED per CLAUDE.md (your api specs; your e2e spec + the
  full web e2e only if you touched shared layout / the UI kit). CI runs the FULL
  api-isolation + e2e suites — deliberately their first full run, not a local gap.

All green → push. Any red → fix first; never spend a CI run to discover it.

## Push

```bash
git status --short                      # confirm: only port-config unstaged, nothing extra committed
git push -u origin <branch>             # commits only; uncommitted port-config stays local
```

## Open the PR with gh-tok

`gh` may lack repo access — use **`gh-tok`** (a gh wrapper carrying a PAT):

```bash
gh-tok pr create --repo LogioOne/tobirato --base main --head <branch> \
  --title "<type>(scope): <summary> (SCR-xxx, RD-xx)" \
  --body-file <path>     # body MUST contain "Closes #<n>" and link the Backlog task
```

Write the body to a file (avoids shell-escaping). **Never self-merge** — a human
merges once green.

## Confirm the PR can actually run CI

```bash
gh-tok pr view <n> --repo LogioOne/tobirato --json mergeStateStatus,mergeable,state
```

- `mergeable: CONFLICTING` / `mergeStateStatus: DIRTY` → **main advanced; CI will
  NOT run** until resolved. Rebase (ci-failures.md → "Conflicting PR").
- `MERGEABLE` + a run appears → proceed to watch.

## Watch CI → tracking file

Run the watcher in the BACKGROUND (it re-invokes you on completion):

```bash
node .claude/skills/tobirato-feature-delivery/scripts/ci-watch.mjs \
  --repo LogioOne/tobirato --branch <branch> --out plans/reports/ci-tracking-<branch>.md
```

It appends a timestamped status row per poll and prints
`CI_DONE conclusion=<x> run=<id>`. `plans/` is not committed — it is a local report.

## On the result

- **success** → all jobs green; confirm with
  `gh-tok api repos/LogioOne/tobirato/actions/runs/<id>/jobs --jq '.jobs[]|"\(.name): \(.conclusion)"'`
  and hand to a human to merge.
- **failure** → diagnose + fix (ci-failures.md) as a **NEW commit** → plain
  `git push` (the PR is open — no amend/force-push), re-annotate the tracking file,
  relaunch the watcher.
