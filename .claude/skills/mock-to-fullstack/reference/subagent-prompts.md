# Sub-agent prompt templates (mock-to-fullstack)

Copy, fill the `{{…}}` slots from `plan.mjs` output, and spawn with the Agent
tool. Keep each agent's context SMALL: give it the plan JSON + the named exemplar
paths, and tell it to read ONLY those. That is the token saving — the orchestrator
never pastes the raw screen or the whole repo into any agent.

Run backend and frontend agents **in parallel** (one message, two Agent calls)
when the API contract is already settled; run backend FIRST and pass its route
shapes to the frontend agent when it is not.

---

## Backend agent (NestJS)

> You are extending the Tobirato NestJS API (`apps/api`). Task: implement the
> backend for **{{screenLabel}}** (SCR-{{scrCode}}), operations: {{detectedOps}}.
>
> Read FIRST, in this order, and mirror them exactly — do not invent a new style:
> 1. `.claude/skills/mock-to-fullstack/reference/conventions.md` (Backend section)
> 2. These exemplars: {{backend.exemplars}}
>
> Then implement under `apps/api/src/modules/{{targetModule}}/`. Hard rules:
> - Multi-tenancy is Postgres RLS. NEVER add a tenant WHERE clause. Repositories
>   extend `BaseRepository` and use `this.client`; reads run in
>   `db.withTenant(requireTenant(req), () => …)`.
> - Every query/body value is validated by hand in the controller (throw
>   `BadRequestException` on unknown values); no class-validator, no DTO classes.
> - Build SQL with a local `bind()` helper — every value is a `$n` bound param.
> - snake_case `Row` interface → camelCase result interface, mapped explicitly.
> - If a new table/column is needed, add a `node-pg-migrate` migration and update
>   the dev seed. Add/extend `vitest` tests.
> - English code & comments. No hardcoded brand/domain.
>
> Deliverable: the created/edited file paths, the exact route(s) + their
> request/response shapes (the frontend depends on these), and any new migration.
> Do NOT commit, push, or open a PR. Run
> `bash .claude/skills/mock-to-fullstack/scripts/check.sh api` and report the result.

---

## Frontend agent (Next.js)

> You are extending the Tobirato web app (`apps/web`, Next.js 15 App Router,
> React 19, next-intl). Task: build **{{screenLabel}}** (SCR-{{scrCode}}) so it
> does what the mock draws. Operations: {{detectedOps}}.
>
> The screen's structure and copy are in this plan's `screenSummary`; the pixel
> reference is `{{screen}}` (open it in a browser only if you need to see layout —
> do NOT read its raw HTML into context, it is inline-styled and huge).
>
> Read FIRST and mirror: `reference/conventions.md` (Frontend section) + these
> exemplars: {{frontend.exemplars}}.
>
> Backend contract to call: {{paste routes/shapes from the backend agent}}.
>
> Implement under `apps/web/src/app/{{targetRoute}}/`:
> - Server component `page.tsx`; split repeated/interactive parts into siblings.
> - Data through `lib/{{module}}.ts` (via `lib/api-client.ts`); mutations through
>   `lib/{{entity}}-actions.ts` (`'use server'`).
> - ONE stylesheet `src/app/styles/{{module}}.css`; ONE message file
>   `src/messages/ja/{{module}}.json`, registered in `messages/ja/index.ts`.
> - ALL visible text comes from the message file (`useTranslations`/
>   `getTranslations`) — no hardcoded Japanese in JSX. No hardcoded brand/domain.
>   Icons from `lucide-react`.
> - Handle the empty vs no-match distinction the mock implies (see orders/products).
>
> Deliverable: created/edited paths. Do NOT commit/push/PR. Run
> `bash .claude/skills/mock-to-fullstack/scripts/check.sh web` and report the result.

---

## Verifier agent (optional, for a whole screen)

> Confirm SCR-{{scrCode}} works end to end. Start the app per the `run` skill,
> drive the {{detectedOps}} flows, and screenshot the result. Compare against the
> mock `{{screen}}`. Report concrete diffs (layout, missing states, wrong copy),
> not a pass/fail opinion. Read `.claude/skills/mock-to-fullstack/reference/conventions.md`
> for what "done" means here.
