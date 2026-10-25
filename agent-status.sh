#!/usr/bin/env bash
# agent-status.sh — read-only orientation snapshot. Always exits 0.

set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8085}"
BASE_URL="http://localhost:${PORT}"

hr() { printf '%.0s─' {1..70}; echo; }
section() { hr; printf "  %s\n" "$1"; hr; }

section "Dev server"
pid="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n1 || true)"
if [[ -n "$pid" ]]; then
  echo "  port $PORT: UP (pid $pid)"
else
  echo "  port $PORT: DOWN   → bash init.sh"
fi
if body="$(curl -fsS "$BASE_URL/health" 2>/dev/null)"; then
  echo "  $BASE_URL/health: 200 $body"
else
  echo "  $BASE_URL/health: UNREACHABLE"
fi
echo "  data store: none (browser localStorage only — no database)"

section "Git"
if git rev-parse --git-dir >/dev/null 2>&1; then
  echo "  branch:      $(git rev-parse --abbrev-ref HEAD)"
  echo "  last commit: $(git log -1 --pretty=format:'%h %s (%ar)')"
  echo "  dirty files: $(git status --porcelain | wc -l | tr -d ' ')"
  for h in pre-commit commit-msg pre-push; do
    [[ -x ".git/hooks/$h" ]] && echo "  hook $h: installed" || echo "  hook $h: MISSING → bash init.sh"
  done
fi

section "Feature registry (feature_list.json)"
if [[ -f feature_list.json ]] && command -v jq >/dev/null 2>&1; then
  echo "  total: $(jq length feature_list.json)   passing: $(jq '[.[]|select(.passes)]|length' feature_list.json)   open: $(jq '[.[]|select(.passes|not)]|length' feature_list.json)"
  echo "  next up:"
  jq -r '[.[]|select(.passes|not)]|sort_by(.priority)|.[:3][]|"    [\(.priority)] \(.id)"' feature_list.json
else
  echo "  feature_list.json missing or jq not installed"
fi

section "Code health"
if node -e 'require("./script.js")' >/dev/null 2>&1; then
  echo "  script.js: loads OK in Node"
else
  echo "  script.js: FAILS TO LOAD → node -e 'require(\"./script.js\")'"
fi
if out="$(npx jest --silent 2>&1)"; then
  echo "  unit + architecture tests: PASS ($(printf '%s' "$out" | grep -oE 'Tests: +[0-9]+ passed' | head -1))"
else
  echo "  unit + architecture tests: FAIL → npm test"
  printf '%s\n' "$out" | grep -E '●|Tests:' | head -8 | sed 's/^/    /'
fi
echo "  architecture baseline: $(node tests/architecture/rules.js --stale 2>&1 | head -1)"

hr
echo "Done."
exit 0
