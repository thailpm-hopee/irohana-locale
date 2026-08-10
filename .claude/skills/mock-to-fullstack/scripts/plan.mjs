#!/usr/bin/env node
/**
 * Build a deterministic PLAN for turning one mock screen into React + NestJS,
 * so the orchestrator spends no tokens re-deriving the same mapping each run.
 *
 * Combines outline.mjs (compact screen summary) with the SCR→module map and the
 * exemplar/target file lists from reference/conventions.md. Feed the JSON to the
 * backend and frontend sub-agents — they read the named exemplars + this plan,
 * NOT the raw screen or the whole repo.
 *
 * Usage:  node plan.mjs <screen.html> [--repo <path-to-tobirato-root>]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const screen = args.find(a => !a.startsWith('--'));
const repoIdx = args.indexOf('--repo');
const repo = (repoIdx >= 0 ? args[repoIdx + 1] : undefined) || guessRepo();
if (!screen) { console.error('Usage: node plan.mjs <screen.html> [--repo <root>]'); process.exit(1); }

function guessRepo() {
  let d = process.cwd();
  while (d !== '/') { if (fs.existsSync(path.join(d, 'pnpm-workspace.yaml'))) return d; d = path.dirname(d); }
  return process.cwd();
}

const outline = JSON.parse(execFileSync('node', [path.join(here, 'outline.mjs'), screen], { encoding: 'utf8' }));
const scr = (outline.screenLabel.match(/SCR-([0-9a-z]+)/) || [])[1] || '';
const num = parseInt(scr, 10);

// SCR number → { module (api), route (web) }. Verify against the repo before trusting.
function mapScr(n) {
  if ([1, 2].includes(n)) return { module: 'auth-tenant', route: '(auth)' };
  if (n === 3) return { module: 'orders', route: '(app)' };
  if ([10, 11, 12].includes(n)) return { module: 'orders', route: '(app)/orders' };
  if ([30, 31, 32, 33, 40, 50, 60].includes(n)) return { module: 'documents', route: '(app)/shipments' };
  if ([70, 71].includes(n)) return { module: 'orders', route: '(app)/shipments' };
  if ([80, 81, 82].includes(n)) return { module: 'products', route: '(app)/products' };
  if ([100, 101, 102].includes(n)) return { module: 'refunds', route: '(app)/refunds' };
  if ([110, 111, 113].includes(n)) return { module: 'settings', route: '(app)/settings' };
  return { module: '(unknown — inspect repo)', route: '(app)/(unknown)' };
}
const { module, route } = mapScr(num);

// Exemplars per detected shape (paths relative to apps/api & apps/web).
const ops = new Set(outline.detectedOps);
const apiExemplars = new Set();
const webExemplars = new Set([
  'apps/web/src/app/(app)/products/page.tsx',
  'apps/web/src/messages/ja/products.json',
  'apps/web/src/app/styles/products.css',
]);
if (ops.has('search') || ops.has('filter') || !ops.size) {
  apiExemplars.add('apps/api/src/modules/orders/orders.controller.ts');
  apiExemplars.add('apps/api/src/modules/orders/orders.repository.ts');
  apiExemplars.add('apps/api/src/modules/orders/order-query.ts');
  webExemplars.add('apps/web/src/app/(app)/products/product-toolbar.tsx');
  webExemplars.add('apps/web/src/lib/product-list-query.ts');
}
if (['create', 'update', 'delete'].some(o => ops.has(o))) {
  apiExemplars.add('apps/api/src/modules/products/products.controller.ts');
  apiExemplars.add('apps/api/src/modules/products/products.repository.ts');
  webExemplars.add('apps/web/src/lib/product-actions.ts');
  webExemplars.add('apps/web/src/app/(app)/products/product-table.tsx');
}
if (num >= 100 && num < 110 || outline.screenLabel.includes('ダッシュボード') || outline.screenLabel.includes('見込み')) {
  apiExemplars.add('apps/api/src/modules/orders/summary.controller.ts');
  apiExemplars.add('apps/api/src/modules/orders/summary.repository.ts');
}
apiExemplars.add('apps/api/src/platform/db');   // BaseRepository, DbService, withTenant
apiExemplars.add('apps/api/src/platform/http'); // requireTenant, isUuid

const entity = module === '(unknown — inspect repo)' ? '<entity>' : module.replace(/s$/, '');
const plan = {
  screen: outline.file,
  screenLabel: outline.screenLabel,
  scrCode: scr,
  detectedOps: outline.detectedOps,
  statusChips: outline.statusChips,
  targetModule: module,
  targetRoute: route,
  build: {
    backend: {
      note: `Extend apps/api/src/modules/${module}/ (create the module dir if new). ` +
        `Mirror the exemplars. RLS tenancy: no WHERE tenant clause, use BaseRepository/this.client, ` +
        `db.withTenant in reads, bind() every value, manual validation in the controller. ` +
        `Add a node-pg-migrate migration if a new table/column is needed.`,
      exemplars: [...apiExemplars],
    },
    frontend: {
      note: `Extend apps/web/src/app/${route}/ . Server component page + sibling components. ` +
        `Data via lib/${module}.ts (api-client), mutations via lib/${entity}-actions.ts ('use server'). ` +
        `ONE css: styles/${module}.css . ONE message file: messages/ja/${module}.json (register in index.ts). ` +
        `No hardcoded JP strings, no hardcoded brand/domain. lucide-react icons.`,
      exemplars: [...webExemplars],
    },
  },
  screenSummary: {
    actions: outline.actions, fields: outline.fields, counts: outline.counts,
  },
  reminders: [
    'After verify: report & ask the user to review, WAIT for confirmation, then commit/PR (never automatically). PR-only to main; never self-merge (CLAUDE.md).',
    'Verify with: bash .claude/skills/mock-to-fullstack/scripts/check.sh api web',
    'Confirm the SCR→module guess against the actual repo before writing.',
  ],
  repo,
};
console.log(JSON.stringify(plan, null, 2));
