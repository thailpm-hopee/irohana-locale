---
name: mock-to-fullstack
description: Turn a Tobirato mock/design-doc screen (a split screen HTML, e.g. from scr-bundle-split) plus a task requirement into working React (Next.js 15) + NestJS code with correct list/create/edit/update/delete/aggregate logic. Orchestrates sub-agents (backend + frontend) off a compact machine-extracted plan to keep token cost low, and uses helper scripts for the repeated, deterministic steps. Use when asked to "implement / build / generate a screen", "make the mock do what it draws", or wire a design screen to the API.
---

# mock-to-fullstack

Read a requirement + a mock screen → produce a working Next.js screen and its
NestJS module with correct CRUD/aggregate logic, matching this repo's house style.
Cost is controlled by **not** feeding raw screens or the whole codebase to any
model: deterministic scripts extract a compact plan, and scoped sub-agents build
from that plan + a few named exemplars.

## The repo is already implementing these screens

Most SCR screens map to an EXISTING module/route — you are almost always
*extending*, not greenfielding. `plan.mjs` guesses the mapping; verify it.
Backend = NestJS 11 + raw `pg` + Postgres RLS (no ORM). Frontend = Next.js 15 App
Router + React 19 + next-intl. Full rules in `reference/conventions.md`.

## Where the inputs live (git-ignored `docs/handoff/`)

The raw design canon sits under `docs/handoff/` (git-ignored per CLAUDE.md — never
committed):

- **Mock screens** (split, icon-fixed): `docs/handoff/scr-screens/screens/SCR-*.html`
  — the per-screen files produced by the `scr-bundle-split` skill.
- **Requirement / field spec**: `docs/handoff/Tobirato_画面項目定義書_v1_9_4.md`
  (画面項目定義書 = the screen-item definition doc) — the authoritative source for
  each screen's fields, validation, states and copy. Read the section for the SCR
  you are building; it carries the rules the mock can't show.
- Source bundle (if a re-split is needed): `docs/handoff/Tobirato SCR 全画面.html`.

## Workflow

> **Read `reference/screen-build-flow.md` first** — the end-to-end guide distilled
> from real builds: the source map (where each fact lives), the confirm/clarify
> checklist, the seed/test **contract** to pin before spawning agents, and the ⚠️
> traps (wrong module guess, `check.sh | tail` hiding failures, re-seed after
> fixture edits, stacked-branch rebase before the PR).

### 1. Plan (deterministic, ~no tokens) — always run this first
```bash
node .claude/skills/mock-to-fullstack/scripts/plan.mjs \
  "docs/handoff/scr-screens/screens/SCR-080-17a.html"
```
Prints a JSON plan: screen label, SCR code, detected CRUD ops, status chips,
target module/route, the exemplar files to mirror, target files to create, and a
compact `screenSummary`. This replaces reading the 15–40 KB inline-styled screen.
(`outline.mjs` is the sub-step if you want only the screen summary.)

### 2. Confirm the mapping & the requirement
- ⚠️ **`plan.mjs`'s module guess is often wrong.** Verify it against the definition
  doc's **対応オブジェクト** row for the SCR (e.g. SCR-060 → *OBJ-02 出荷* → the
  `shipments` module), then `ls apps/api/src/modules` and `ls "apps/web/src/app/(app)"`.
- Pull the screen's rules from the 定義書 (grep the SCR code): the **フィールド定義**
  table's `表示条件` tells you **which fields have data vs. are out-of-scope**.
  Out-of-scope fields are still drawn the way the frame draws them, disabled with
  the reason on screen. Confirm each field's real data source (column/DTO) now.
- Ask the user any load-bearing ambiguity BEFORE building (frame-only details like
  predicted-vs-actual dates, decorative values with no column, currency).
- **Pin the contract** before spawning agents: API route shapes **+ seed/fixture
  shapes + test-assertion strategy** (catalog text vs. status→CSS-class signal).
  If all three are settled, run backend + frontend in parallel; else backend first.

### 3. Build with sub-agents (the token saver)
Spawn scoped agents using the templates in `reference/subagent-prompts.md`. Fill
the `{{…}}` slots from the plan JSON. Give each agent ONLY: the plan, the named
exemplar paths, and its half of the work. **Do not** paste the raw screen or ask
it to explore the repo.
- **Backend agent** → the NestJS module (controller/service/repository/query +
  migration + tests). Returns the exact route shapes.
- **Frontend agent** → the Next.js page + siblings, `lib/*` data & actions, the
  one CSS file, the one message file. Consumes the backend's route shapes.
- Run them in ONE message (two Agent calls) when parallel.

For a large batch of screens, drive them with a `Workflow` pipeline (one item per
screen: plan → backend → frontend → verify) so wall-clock ≈ the slowest screen,
not the sum. Only reach for that when the user has opted into orchestration.

### 4. Verify — same gate every time
```bash
bash .claude/skills/mock-to-fullstack/scripts/check.sh api web
```
Runs the repo's typecheck + lint + **design-token lint** + tests for the touched
packages. Fix until green.
- ⚠️ **Never pipe it through `| tail`/`| grep`** — the pipeline's exit code is the
  filter's, so a real `✗ checks failed` reads as success. Run raw, or read the
  explicit `✓ all checks passed` / `✗ checks failed` line.
- ⚠️ **Design-token lint must cover NEW/unstaged files.** `check.sh` runs it the
  working-tree-aware way; if you run it by hand, do NOT use a bare
  `pnpm lint:tokens` — with no args it scans only git-**tracked** files
  (`git ls-files -- apps/web packages/ui`), so a brand-new untracked
  `.css`/`.tsx` full of raw HEX / bare Primitive tokens is silently SKIPPED and
  only fails in CI once staged. Feed the working-tree changes to the script:
  ```bash
  node scripts/lint-no-raw-hex.mjs $(git ls-files -mo --exclude-standard \
    -- apps/web packages/ui | grep -E '\.(css|tsx?|jsx?|mjs|cjs)$')
  ```
  (`-m` modified, `-o` untracked, `--exclude-standard` respects `.gitignore`);
  if that list is empty, fall back to `pnpm lint:tokens`.
- ⚠️ It does **not** run Playwright (needs a running app + seeded DB). ⚠️ If you
  changed `seed-fixtures.ts`/`seed-dev-data.ts`, `pnpm --filter @tobirato/api seed`
  first, then run e2e separately.
- Screenshot vs. mock **early** (`run` + `verify` skills) — one visual pass saves
  many design-correction rounds.

### 5. Report & ask — then WAIT (do NOT commit yet)
When implementation + the §4 gate are green, **stop**. Leave the work in the
working tree (staging the feature files for review is fine), then **report** to
the user: what you built (files/module/route), the verification results (the
explicit `✓ all checks passed` line), and any screenshot-vs-mock notes. Then
**explicitly ask the user to review and make any edits**, and **WAIT** for their
confirmation. **Do not create a commit, push a branch, or open a PR at this
step** — even in `--auto`/autonomous runs.

### 6. Ship — PR only, ONLY after the user confirms
Do this **only once the user has explicitly given the go-ahead**. The mechanics
are unchanged — you are only changing *when* they run:
- ⚠️ **First reconcile with `main`.** A branch stacked on a dependency needs a
  `fetch origin main` and a check of whether the dependency already merged (squash
  → *different hash*, so compare **content/files**, not the hash). If so,
  `git rebase origin/main` (already-applied commits auto-drop), and confirm
  `git diff --stat origin/main...HEAD` (**three** dots) is only your feature.
- Keep machine-local edits (dev port remaps in `.env*`/`configuration.ts`/`main.ts`/
  `package.json`/`packages/config`) **out** of the commit.
- Push + PR via **`gh-tok`** (not plain `gh`/`git`), `Closes #<n>`, conventional
  subject ending `(#n)`. **Never commit/push to `main`, never self-merge** — a
  human merges (CLAUDE.md). Your job ends at "PR open, CI green".

See `reference/screen-build-flow.md` §9 for the exact rebase/push commands.

## Handoff — wait for confirmation before committing

The end-to-end order is: **implement → verify → report & ask → WAIT → (only on
the user's explicit go-ahead) commit + PR.** Never commit, push, or open a PR
automatically — not even when everything is green, and not in `--auto` runs. The
skill's job before confirmation ends at "built, verified, reported, awaiting
review." Only after the user confirms do you run the §6 commit/PR mechanics.

## Helper scripts (do the repeated work, save tokens)
- `scripts/outline.mjs <screen.html>` — screen HTML → compact JSON (title, CRUD
  actions, fields, status chips, text skeleton). Drops styles/SVG/fonts.
- `scripts/plan.mjs <screen.html>` — outline + SCR→module map + exemplar/target
  lists → one build plan JSON.
- `scripts/check.sh [api] [web]` — the repo's typecheck/lint/design-token-lint/test
  gate (the token lint runs the working-tree-aware way, so new/unstaged files count).

## Guardrails (make the model apply these to every generated file)
- Multi-tenancy is RLS: never add a tenant WHERE clause; use `BaseRepository` /
  `db.withTenant`; `bind()` every SQL value.
- No hardcoded Japanese in JSX — everything through the screen's next-intl message
  file. No hardcoded brand name or domain (env/config only).
- One CSS + one message file per screen. English code, comments, commits.
- Prefer extending an existing module over creating a parallel one.
- ⚠️ **Touch only the plan's target files.** Never edit env/config/ports
  (`.env*`, `configuration.ts`, `main.ts`, `package.json`, `packages/config`) or
  lockfiles to "make it run" — report a clash instead. After agents finish,
  `git status` for stray out-of-plan files and revert them.
- ⚠️ **Design tokens come from `packages/ui/src/styles/tokens.bougainvillea.css`**
  (`--petal-*`, `--forest-*`, `--status-*-bg/fg`, `--brass-*`, `--radius-*`). Grep
  it; no hardcoded hex, no guessed `var(--x, 999px)` fallbacks.
- ⚠️ React 19: `useRef<T>()` needs an initial arg — `useRef<T | undefined>(undefined)`.

Pairs with **scr-bundle-split**, which produces the per-screen mock files this
skill consumes.
