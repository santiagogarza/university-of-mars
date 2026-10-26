#!/usr/bin/env bash
# Restore planted demo files from seeds/ onto main as a normal commit.
# Never force-pushes. Pass --push to update origin/main with a fast-forward push.
# Runs npm run check-seeds after the restore.
#
# Usage:
#   npm run reset-demo
#   npm run reset-demo -- --push
#
# When SERVICES_URL and DEMO_BOT_KEY are set, this also POSTs /api/admin/reset.
# Open /support/?reset=1 to clear ticket keys saved in a browser.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PUSH=0
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    -h|--help)
      echo "Usage: npm run reset-demo -- [--push]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ ! -f seeds/MANIFEST ]]; then
  echo "seeds/MANIFEST is missing." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes, then run this again." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  git checkout main
fi

if ! git pull --ff-only origin main; then
  echo "Could not fast-forward main from origin. Continuing with the local main branch." >&2
fi

while IFS= read -r rel || [[ -n "$rel" ]]; do
  [[ -z "$rel" || "$rel" == \#* ]] && continue
  if [[ ! -f "seeds/$rel" ]]; then
    echo "Missing seeds/$rel" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$rel")"
  cp "seeds/$rel" "$rel"
  git add -- "$rel"
done < seeds/MANIFEST

if git diff --cached --quiet; then
  echo "Seed files already match the baseline. Nothing to commit."
else
  git commit -m "$(cat <<'EOF'
Restore demo seed content

Puts the seeded pages and styles back so the workshop issues are present again.
EOF
)"

  if [[ "$PUSH" -eq 1 ]]; then
    git push origin main
  fi

  echo "Demo seed files restored on main."
fi

if [[ -n "${SERVICES_URL:-}" && -n "${DEMO_BOT_KEY:-}" ]]; then
  echo "Restoring services seed data..."
  curl --fail-with-body --silent --show-error \
    -X POST "${SERVICES_URL%/}/api/admin/reset" \
    -H "x-demo-key: ${DEMO_BOT_KEY}" \
    -H "content-type: application/json" \
    --data '{}'
  echo
  echo "Services seed restored."
else
  echo "SERVICES_URL or DEMO_BOT_KEY is not set. Skipped the services reset."
fi

echo "To clear tickets saved in a browser, open:"
echo "  https://santiagogarza.github.io/university-of-mars/support/?reset=1"

npm run check-seeds
