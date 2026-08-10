#!/usr/bin/env bash
# Run the repo's own gates for the packages a build touched, so every sub-agent
# and the orchestrator verify the same cheap, deterministic way. Keeps the loop
# steady: fix until this is green, THEN report & ask the user to review and wait
# for their go-ahead before committing/opening the PR (never self-merge).
#
# Usage:  bash check.sh [api] [web]      # default: both
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../../../.. && pwd)"
cd "$ROOT" || exit 1
targets=("$@"); [ ${#targets[@]} -eq 0 ] && targets=(api web)

fail=0
run() { echo "── $* ──"; if ! "$@"; then fail=1; fi; }

# Design-token lint (DESIGN.md Rule 9: no raw HEX, no bare Primitive tokens).
# ⚠️ `pnpm lint:tokens` with no args scans only git-TRACKED files
# (`git ls-files -- apps/web packages/ui`), so a brand-new, still-untracked
# .css/.tsx is silently SKIPPED and only fails in CI once staged. Feed the
# working-tree changes (modified + untracked, .gitignore-respecting) to the
# script directly; fall back to `pnpm lint:tokens` only when there are none.
run_lint_tokens() {
  echo "── lint:tokens (working tree) ──"
  local files
  files="$(git ls-files -mo --exclude-standard -- apps/web packages/ui \
    | grep -E '\.(css|tsx?|jsx?|mjs|cjs)$' || true)"
  if [ -n "$files" ]; then
    # shellcheck disable=SC2086
    if ! node scripts/lint-no-raw-hex.mjs $files; then fail=1; fi
  else
    if ! pnpm lint:tokens; then fail=1; fi
  fi
}

for t in "${targets[@]}"; do
  case "$t" in
    api)
      run pnpm --filter @tobirato/api typecheck
      run pnpm --filter @tobirato/api lint
      run pnpm --filter @tobirato/api test
      ;;
    web)
      run pnpm --filter @tobirato/web typecheck
      run pnpm --filter @tobirato/web lint
      run_lint_tokens
      ;;
    *) echo "unknown target: $t (use: api web)"; fail=1 ;;
  esac
done

if [ "$fail" -ne 0 ]; then echo "✗ checks failed"; exit 1; fi
echo "✓ all checks passed"
