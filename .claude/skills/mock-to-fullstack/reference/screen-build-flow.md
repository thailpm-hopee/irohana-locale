# Screen build flow (Tobirato mock → full-stack)

The end-to-end path for turning one SCR screen into shipped code, written from
the friction of real builds. Read this alongside `conventions.md` (house style)
and `subagent-prompts.md` (agent templates). Follow it in order; the callouts
marked ⚠️ are the mistakes that actually cost time.

---

## 0. Where the data lives (the source map)

Answer every question from the authoritative source, not from guessing. For a
screen `SCR-0NN`:

| You need… | Read | Notes |
| --- | --- | --- |
| Layout / pixels | `docs/handoff/scr-screens/screens/SCR-0NN-*.html` | The frame. Layout authority. Open in a browser; don't read the raw inline-styled HTML into context. |
| Which module/route | `docs/handoff/Tobirato_画面項目定義書_v1_9_4.md` → the SCR section's **対応オブジェクト** row | e.g. SCR-060 → *OBJ-02 出荷* → the `shipments` module/route. This beats `plan.mjs`'s keyword guess. |
| Field rules & which fields have data | same doc → **フィールド定義** table | `種別` ([R]/[A]), `型`, **`表示条件`** (when shown), 備考. This is the rules authority. Where frame and doc disagree: **frame wins layout, doc wins rules.** |
| DB columns | `apps/api/migrations/*.cjs` (grep the table/object name) | Confirms what data exists (e.g. `tracking_event.location`, `shipment_item.weight_snapshot`). Note RLS helpers (`_apply_tenant_rls`, `_apply_append_only_rls`). |
| Existing API module | `apps/api/src/modules/<name>/` | Mirror one existing endpoint end-to-end (controller → `withTenant` → repository `bind()` → Row→camelCase). |
| Existing web route | `apps/web/src/app/(app)/<screen>/` | page.tsx + siblings; how it fetches (server component). |
| DTOs & fetchers | `apps/web/src/lib/<entity>.ts` | The typed contract the page consumes. |
| Seed data | `apps/api/scripts/seed-fixtures.ts` (data) + `seed-dev-data.ts` (writer) | Keep the boundary: data in fixtures, writing in the writer. |
| Design tokens | `packages/ui/src/styles/tokens.bougainvillea.css` | ⚠️ The ONLY source for `--petal-*`, `--forest-*`, `--status-*-bg/fg`, `--brass-*`, `--radius-*`, `--bg-*`, `--text-*`. Grep it; never guess a token or ship a `var(--x, 999px)` fallback. |
| Shared UI / hooks | `apps/web/src/components/`, `apps/web/src/hooks/` | Reuse `StatusBadge`, `StubMarker`, `CopyButton`, `useCopyToClipboard`, `useAutoFocus`, etc. before writing new. |
| e2e patterns | `apps/web/e2e/*.spec.ts` + `e2e/helpers/auth.ts` | `signInAs`, `SEED_TENANT`, role selectors, `ja.*` assertions, the tenant-isolation test shape. |

---

## 1. Confirm & clarify (before any code)

Lock these; ask the user only the ones the sources can't settle.

- **Module/route** — verified against 対応オブジェクト + `ls apps/api/src/modules` and `ls "apps/web/src/app/(app)"`. Are we **extending** an existing screen (almost always) or greenfielding? Extending → grow the existing `styles/<screen>.css` and `messages/ja/<screen>.json`, don't create parallels.
- **Per field: data or placeholder.** For each フィールド, name its real source (column/DTO) or mark it out-of-scope. Out-of-scope fields are still **drawn the way the frame draws them, disabled/placeholder, with the reason on screen** — never silently dropped.
- **Ambiguous "match the frame" details** — dates (predicted ETA vs real arrival), decorative numbers (a weight with no column), currency, brand strings. These are user calls; ask with concrete options.
- **Seed reachability** — does the demo data reach every state the screen draws (empty, each status/badge, the failure path)? If not, plan a seed extension.
- **Test-assertion strategy** — decide up front: assert on **catalog text** (stable, in `messages/ja`) or on **data-driven signals** (a status → CSS modifier class) when the visible text is free-form/English seed data. ⚠️ Picking wrong here means rewriting the e2e.

## 2. Plan

Run `scripts/plan.mjs "<screen.html>"`. ⚠️ **Verify and override `targetModule`/`targetRoute`** against §0 — the keyword guess is frequently wrong (SCR-060 guessed `documents`; truth was `shipments`).

## 3. Contract (the parallelisation gate)

Before spawning agents, write down all three so backend and frontend can't drift:
1. **API route shapes** — path, params, exact request/response JSON.
2. **Seed/fixture shapes** — statuses, counts, tracking numbers, which record is the failure; the language of free-text fields.
3. **Test strategy** — from §1.

If all three are settled, run backend + frontend agents in parallel (disjoint dirs). If the seed/contract is still fluid, do backend first and hand its real shapes to the frontend.

## 4. Build (sub-agents)

Use the `subagent-prompts.md` templates. Add these guardrails to every agent:
- ⚠️ **Touch only the files in the plan's target list.** Never modify env/config/ports (`.env*`, `configuration.ts`, `main.ts`, `package.json`, `packages/config`) or lockfiles to "make it run." If a port clashes, report it — don't rewrite it.
- Tokens from `tokens.bougainvillea.css` only. No hardcoded hex, no guessed-var fallbacks.
- One CSS + one message file per screen; register new message files in `messages/ja/index.ts`.
- ⚠️ React 19: `useRef<T>()` needs an initial arg — `useRef<T | undefined>(undefined)`.

## 5. Reconcile

After the agents return: diff the working tree for **files changed outside the plan's targets** (`git status`) and revert/flag them. Reconcile any e2e assumptions against the seed the backend actually built. Confirm shared components landed in `components/` + `hooks/`, not inside the route folder.

## 6. Seed

⚠️ If `seed-fixtures.ts`/`seed-dev-data.ts` changed, re-run the seed or the DB (and e2e) still shows the old data:
```
pnpm --filter @tobirato/api seed
```
Spot-check with a query through the running Postgres container if in doubt.

## 7. Verify

```
bash .claude/skills/mock-to-fullstack/scripts/check.sh api web
```
- ⚠️ **Do not pipe through `| tail`/`| grep`** — the pipeline exit code is the last command's, so a real `✗ checks failed` reads as success. Run it raw, or read the explicit `✓ all checks passed` / `✗ checks failed` line.
- ⚠️ `check.sh` runs typecheck + lint + the **design-token lint** (DESIGN.md Rule 9) + the **API vitest** suite. It does **not** run Playwright (needs a running app + seeded DB). Run e2e separately: `pnpm dev` (+ `db:setup`) then `pnpm --filter @tobirato/web test:e2e <spec>`.
- ⚠️ **The design-token lint must see NEW/unstaged files.** `check.sh` invokes it the working-tree-aware way; if you run it by hand, do NOT use a bare `pnpm lint:tokens` — with no args it scans only git-**tracked** files (`git ls-files -- apps/web packages/ui`), so a brand-new untracked `.css`/`.tsx` full of raw HEX or bare Primitive tokens is silently SKIPPED and only fails once staged (in CI). Feed the working-tree changes to the script instead:
  ```
  node scripts/lint-no-raw-hex.mjs $(git ls-files -mo --exclude-standard \
    -- apps/web packages/ui | grep -E '\.(css|tsx?|jsx?|mjs|cjs)$')
  ```
  (`-m` modified, `-o` untracked, `--exclude-standard` respects `.gitignore`); if that file list is empty, fall back to `pnpm lint:tokens`.
- Known-flaky: `shipment-completion.test.ts` can hit a 30s server-boot timeout; re-run before believing a failure.
- **Screenshot vs mock** early (the `run` + `verify` skills). One visual pass here saves many correction rounds later.

## 7.5. Report & ask — WAIT (do NOT commit yet)

When §7 is green, **stop and hand off**. Report to the user: what you built
(files/module/route), the verification result (the explicit `✓ all checks
passed` line), and any screenshot-vs-mock notes. Then **explicitly ask them to
review and make any edits**, and **WAIT** for their confirmation. **Do not
commit, push, or open a PR here** — even in `--auto`/autonomous runs. Staging
the feature files for review (§8) is fine; §9 runs **only after** the user's
explicit go-ahead.

## 8. Stage

Stage only the feature files. Keep machine-local edits (the dev port remap in
`.env.example`/`configuration.ts`/`main.ts`/`package.json`/`packages/config`)
**out** of the commit — stage explicitly, or `git add -u` then `git restore --staged` those. Never stage `.claude/`.

## 9. Ship — PR only, ONLY after the user confirms (handles stacked/dependent branches)

> Run this section **only once the user has explicitly confirmed** (see §7.5).
> The mechanics below are unchanged — you are only changing *when* they run.

⚠️ A branch stacked on a dependency (one issue reserved until another is "in review") needs care, because the dependency often **squash-merges** into `main` under a *new hash* — so your ancestor commit looks "ahead" though its content is already on `main`.

```
# refresh main
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
  git -c credential.helper='!/usr/local/bin/gh-tok auth git-credential' fetch origin main

# is the dependency already on main? check CONTENT, not the commit hash:
git ls-tree -r --name-only origin/main -- <a dependency file>
git log --oneline -8 origin/main            # look for the dep's squashed subject

# if it is, rebase so the duplicate commit drops out:
git stash push -- <local-only port files>   # rebase needs a clean tree
git rebase origin/main                       # already-applied commits are auto-skipped
git diff --stat origin/main...HEAD           # THREE dots — must be ONLY your feature
# re-run §7 gate on the rebased state, then:
git -c credential.helper='!/usr/local/bin/gh-tok auth git-credential' push --force-with-lease origin <branch>
git stash pop                                # restore local port config
```

Then open the PR (tobirato uses **`gh-tok`**, not plain `gh`/`git`):
```
gh-tok pr create --base main --head <branch> \
  --title "<conventional subject> (#n)" --body-file <body>   # body has "Closes #n"
```
⚠️ Two-dot `git diff origin/main..HEAD` is misleading when `main` has advanced — always judge the PR contents by the **three-dot** `origin/main...HEAD`.

**Stop at "PR open, CI green." Never self-merge** — a human reviews and merges (CLAUDE.md).
