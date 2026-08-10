# Worktree + test DB setup

## Branch check + worktree

- Fetch first: `git fetch origin --quiet`. Read the tip: `git log origin/main --oneline -3`.
- Create the worktree UNDER the repo (rule: never beside it):
  ```bash
  git worktree add .claude/worktrees/<branch> -b <branch> origin/main
  ```
- Branch name: `issue-<n>-<slug>` (matches the GitHub issue). One PR per task.
- Install in the worktree: `cd .claude/worktrees/<branch> && pnpm install`
  (background it; a fresh worktree has no node_modules).

## Its own test database (never a shared one)

The API tests + e2e need Postgres. The dev DB runs in a container (e.g.
`tobirato-db-1` on host port 5532). Give the worktree an isolated DB so the user's
dev data is untouched:

```bash
docker exec tobirato-db-1 createdb -U app app_test_<n>      # roles are cluster-global
sed -E 's/app_dev/app_test_<n>/g' <mainRepo>/.env > .env    # worktree .env, repointed
git check-ignore .env && echo IGNORED                        # confirm .env is gitignored
```

The API test `globalSetup` applies migrations to whatever `DATABASE_URL` names, so a
fresh DB is migrated automatically on first test run. Roles (`tobirato_app`, …) are
created idempotently by the bootstrap migration and exist cluster-wide, so a new DB
just needs the migrations.

## Port-config files are LOCAL ONLY

The dev machine often runs the app on shifted ports. Copy the port edits into the
worktree so `pnpm dev` works, but keep them **uncommitted** — they are NOT part of
the feature and CI ignores them:

- `apps/api/src/config/configuration.ts` (default `PORT`)
- `apps/web/package.json` (`dev`/`start` `-p <port>`)
- `packages/config/src/index.ts` (`apiUrl` default)

Apply the same numbers the user uses (or copy the files from the main checkout).
Before every commit, confirm `git status` shows only these three as modified beside
your staged feature files.

## Reachability / auth notes

- `gh` may lack access to the private repo (404) while git-over-SSH works. Use
  `gh-tok` for GitHub API/PR (see pr-and-ci.md). Git push/fetch work regardless.
- Read the GitHub issue via the task itself when the API is inaccessible — the issue
  usually just points back to the task.
