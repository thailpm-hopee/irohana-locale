# Tobirato stack & conventions (for mock-to-fullstack sub-agents)

This is the house style a generated screen must match. It is distilled so a
sub-agent does NOT have to re-explore the repo — but each build agent should
still open the ONE named exemplar closest to its task and mirror it.

Everything is a pnpm + turbo monorepo. Code, comments, commits: **English**.
UI strings: **Japanese, via next-intl message files — never hardcoded in JSX.**
Never hardcode the brand name or domain (route through config).

## Backend — `apps/api` (NestJS 11, raw `pg`, Postgres RLS)

**No ORM.** Multi-tenancy is enforced by Postgres Row-Level Security, not by
WHERE clauses. That single fact shapes every module.

Module layout: `src/modules/<name>/`
- `<name>.module.ts` — wires controllers + providers; `imports` other modules it reads.
- `<name>.controller.ts` — routes; parses & **validates every query/body value by
  hand** (no class-validator, no DTO classes). Unknown value → `BadRequestException`;
  unknown *param name* → ignored. Tenant comes ONLY from `requireTenant(req)`
  (session cookie) — never from a header/query/body.
- `<name>.repository.ts` — extends `BaseRepository` from `platform/db`; uses
  `this.client` (the tenant transaction connection — throws outside one). Queries
  carry **no tenant predicate** (RLS supplies it). Build SQL with a local
  `bind(value)` helper that pushes to a `values[]` array and returns `$n` — every
  input reaches SQL as a bound parameter, never interpolated. Define a snake_case
  `Row` interface and a camelCase result interface; map between them explicitly.
- `<name>-query.ts` / other `<domain>.ts` — pure helpers, constant tables, type guards.
- Aggregate/summary endpoints get their own `summary.controller.ts` +
  `summary.repository.ts` (see orders). Register fixed-word routes BEFORE `:id`.

Reads run inside `this.db.withTenant(tenantId, () => repo.method(...))`.

Migrations: `node-pg-migrate` files + `pnpm --filter @tobirato/api migrate`;
dev data via `pnpm --filter @tobirato/api seed`. Tests: `vitest`.

**Exemplars to mirror (open the closest one):**
- List + filter + paginate + "empty vs no-match" + available-filter-values:
  `src/modules/orders/orders.controller.ts` + `orders.repository.ts` + `order-query.ts`
- Aggregate/dashboard: `src/modules/orders/summary.controller.ts` + `summary.repository.ts`
- Entity master with edit/confirm + candidate sub-resource:
  `src/modules/products/products.controller.ts` + `products.repository.ts`
- Create/update lifecycle (wizard/draft): `src/modules/orders/shipment-draft.*`
- Platform helpers: `src/platform/db` (BaseRepository, DbService, withTenant),
  `src/platform/http` (requireTenant, isUuid, TenantRequest)

## Frontend — `apps/web` (Next.js 15 App Router, React 19, next-intl)

Server Components by default; interactivity via Server Actions. `lucide-react`
for icons. No client data-fetching library — the server component calls the API.

Layout:
- Route: `src/app/(app)/<screen>/page.tsx` (server component). Split interactive
  or repeated pieces into sibling components, e.g. `product-table.tsx`,
  `product-toolbar.tsx`.
- Data access: `src/lib/<entity>.ts` (typed fetch via `lib/api-client.ts`),
  query-string mapping in `src/lib/<entity>-list-query.ts`.
- Mutations: `src/lib/<entity>-actions.ts` (`'use server'` actions) — the create/
  edit/delete/import handlers the screen's buttons call.
- Styles: **one CSS file per screen** at `src/app/styles/<screen>.css`.
- Copy: **one message file per screen** at `src/messages/ja/<screen>.json`,
  registered in `src/messages/ja/index.ts`; read with `useTranslations`/
  `getTranslations`. (This one-file-per-screen rule is enforced — commit #102/#103.)

**Exemplars to mirror:**
- List screen with toolbar/filters/cards: `src/app/(app)/products/page.tsx` +
  `product-table.tsx` + `product-toolbar.tsx`, `lib/products.ts`,
  `lib/product-list-query.ts`, `lib/product-actions.ts`, `styles/products.css`,
  `messages/ja/products.json`
- Dashboard/metrics: `src/app/(app)/home-metrics.tsx`, `lib/home-summary.ts`
- Shell/nav: `src/components/app-shell.tsx`

## Mapping a mock screen → code

The split screens live at `docs/handoff/scr-screens/screens/SCR-*.html` (git-ignored)
and the field spec at `docs/handoff/Tobirato_画面項目定義書_v1_9_4.md`. Each screen
carries `data-screen-label="SCR-XXX …"`. The SCR code usually maps
to an existing module/route — check first; you are almost always EXTENDING an
existing screen, not creating one from scratch. Rough map (verify against the repo):
SCR-010/011/012 orders·shipments · SCR-030/031/032/033/040/050 documents+carrier ·
SCR-080/081/082 products · SCR-100/101/102 refunds · SCR-110/111/113 settings ·
SCR-001/002 auth · SCR-003 home.

CRUD verbs seen on Tobirato screens (outline.mjs classifies these):
追加/作成/新規=create · 編集/更新/保存=update · 削除=delete · 一括インポート=import ·
CSV/ダウンロード=export · 検索=search · フィルタ/絞り込み=filter · 同期/再認証=sync.
