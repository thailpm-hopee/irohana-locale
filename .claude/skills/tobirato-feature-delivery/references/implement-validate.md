# Understand, implement, validate

## 0. Clarify, then plan (before any code)

- **Clarify only real ambiguity.** If scope/approach is underspecified, ask **1–3**
  clarifying questions (AskUserQuestion) — decisions only the user can make. Do NOT
  ask what the code or design docs already answer; pick a sensible default, state
  it, and move on. Don't over-ask.
- **Always produce a short plan before implementing** — run ONE:
  - **`/plan:fast`** (default) — a clearly-scoped screen that mirrors an existing
    pattern: analyze + implementation plan, no research. Use for most screen tasks.
  - **`/plan`** — when the task needs light research or the approach is unclear
    (prompt-enhanced planning). Use for cross-cutting or new-pattern work.
- Keep the plan lean (files to touch, the pattern to mirror, the rulings). Then do
  the frame extraction below and implement against the plan.

## Understand before writing (mirror, don't invent)

- Extract the design frame + field rules with an **Explore subagent** (frames are
  large — grep the frame, don't open wholesale). See subagents.md.
- Find the closest existing module/screen and **mirror its shape** (controller /
  repository / field-rules on the API; page / table / modal / actions on the web).
  Divergence from the established pattern is what review flags.
- Honour the task's rulings (logical delete, RLS-only tenant scoping, no invented
  plan caps, reserved columns off-screen, etc.). Where frame and definition doc
  disagree: frame wins on layout, definition wins on rules.

## Implement (leave it uncommitted)

- **Do NOT commit yet.** Implement and (below) code-review on the working tree; the
  single commit is deferred until the user approves the manual test (code-review.md
  → "Manual test gate", then pr-and-ci.md). This avoids commit/amend churn while the
  work is still changing.
- Keep new code idiomatic to the files around it (comment density, naming, tokens).
- **CSS**: use Semantic/Component design tokens only — no raw HEX, no primitive
  tokens (`--forest-6`, `--petal-*`) without a `/* primitive-ok: <reason> */`. This
  is a CI gate (ci-failures.md).
- Reuse shared UI-kit components/providers; put new reusable pieces in
  `packages/ui` (components in `components/`, context hosts in `providers/`) and add
  a Storybook story for new components (not for providers unless asked).
- New screen route → record it in `docs/manual/screens.json` (that marks it
  "built", which then requires a committed screenshot — see ci-failures.md).

## Local validation gauntlet (mirrors CI — also the pre-push gate)

Run from the worktree root; fix until all green. This same gauntlet is the hard
pre-push gate (pr-and-ci.md): re-run it to green immediately before EVERY push,
since a push spends CI minutes and a re-push round-trip.

```bash
pnpm typecheck && pnpm lint && pnpm build     # CI "Run checks"
pnpm lint:tokens && pnpm lint:manual          # CI design-token + manual manifest
pnpm --filter @tobirato/web test              # CI "Web unit tests" (vitest)
cd apps/api && pnpm vitest run test/http/<feature>.test.ts   # CI api-tests
pnpm --filter @tobirato/web test:e2e <spec>.spec.ts          # CI web-e2e (self-seeds)
```

- Write API tests covering tenant isolation, the deliberate rulings, and any
  FK/soft-delete guards; write a browser spec for the screen.
- A failing test in the FULL e2e that PASSES in isolation is parallel-load flake,
  not a regression — re-run the single spec to confirm before blaming your change.
- Before committing, run the full web e2e once when you touched shared layout / the
  UI kit (those affect every screen).

## Capture the design-fidelity screenshot

Before code review, snapshot the built screen so it can be checked against the
design (the visual comparison itself is the user's — do NOT auto-compare):

```bash
# add a TARGET (path + a screen-only `expect` string) to
# apps/web/e2e/manual-shots.spec.ts if the screen has none yet, then:
pnpm --filter @tobirato/web manual:shots      # → docs/manual/assets/SCR-xxx.png
git checkout -- docs/manual/assets/           # drop font-rasterization churn on other PNGs
```

Keep ONLY the new `SCR-xxx.png` (it doubles as the CI manual-manifest asset —
ci-failures.md). Hand this PNG to the user at the manual-test gate to eyeball
against the design frame. Note anything that obviously deviates from the frame and
fix it now; leave subjective calls for the user.

**Fallback — screen has no route / no manifest entry yet** (`manual:shots` can only
shoot built, routed screens). Shoot the running dev server directly with the
`chrome-devtools` skill (Puppeteer): start `pnpm dev`, capture the screen's URL to
`docs/manual/assets/SCR-xxx.png`. Same purpose (hand it over for the user to
eyeball) — it just isn't the CI manifest asset yet. Once the route + a
`manual-shots.spec.ts` TARGET exist, re-shoot with `manual:shots` so the committed
PNG is the canonical one.

## Commit — NOT here

The single commit is created only AFTER the user approves the manual test — see
pr-and-ci.md. Until then everything stays in the working tree (feature files +
`SCR-xxx.png`), reviewed via `git diff origin/main`.
