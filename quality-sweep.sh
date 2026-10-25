#!/usr/bin/env bash
# quality-sweep.sh — drift detector. Exits non-zero on any finding.
#   bash quality-sweep.sh
# Warnings ([warn]) are reported but don't fail the sweep.

set -uo pipefail
IFS=$'\n\t'
# Sweep the repo root, wherever this script is called from.
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0")"

EXIT=0
fail() { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; EXIT=1; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
ok()   { printf "\033[1;32m[ ok ]\033[0m %s\n" "$*"; }
hdr()  { printf "── %s %s\n" "$1" "$(printf '%.0s─' $(seq 1 $((60 - ${#1}))))"; }

SRC_JS=(script.js scripts/serve.js)

# ---------------------------------------------------------------------------
hdr "Tests (unit + architecture)"
# ---------------------------------------------------------------------------
if out="$(npx --no-install jest --silent 2>&1)"; then
  ok "jest: $(printf '%s' "$out" | grep -oE 'Tests: +[0-9]+ passed[^\n]*' | head -1)"
else
  fail "jest suite failing → npm test"
  printf '%s\n' "$out" | grep -E '●|FAIL  rule|Why:|Fix:|Tests:' | head -20 | sed 's/^/      /' >&2
fi

# ---------------------------------------------------------------------------
hdr "Architecture baseline (ratchet)"
# ---------------------------------------------------------------------------
if stale="$(node tests/architecture/rules.js --stale 2>&1)"; then
  ok "$stale"
else
  fail "Baseline has entries the code no longer needs — lower them:"
  printf '%s\n' "$stale" | sed 's/^/      /' >&2
fi
# The baseline may only shrink. Compare against the last committed version.
if git cat-file -e HEAD:tests/architecture/baseline.json 2>/dev/null; then
  grew="$(node -e '
    const cur = require("./tests/architecture/baseline.json");
    const old = JSON.parse(require("child_process").execSync("git show HEAD:tests/architecture/baseline.json"));
    const out = [];
    for (const [r, e] of Object.entries(cur)) { if (r.startsWith("_")) continue;
      for (const [k, n] of Object.entries(e)) { const was = (old[r] || {})[k] || 0; if (n > was) out.push(`${r}/${k}: ${was} → ${n}`); } }
    console.log(out.join("\n"));')"
  if [[ -n "$grew" ]]; then
    fail "Architecture baseline GREW since HEAD (it may only shrink):"
    printf '%s\n' "$grew" | sed 's/^/      /' >&2
  else
    ok "Baseline did not grow since HEAD"
  fi
else
  warn "baseline.json not committed yet — growth check starts after the first commit"
fi

# ---------------------------------------------------------------------------
hdr "Config integrity"
# ---------------------------------------------------------------------------
for f in package.json feature_list.json .claude/settings.json tests/architecture/baseline.json; do
  [[ -f "$f" ]] || { fail "$f missing"; continue; }
  jq empty "$f" >/dev/null 2>&1 && ok "$f is valid JSON" || fail "$f is invalid JSON"
done
if [[ -f feature_list.json ]]; then
  dupes=$(jq -r '[.[].id] | group_by(.) | map(select(length>1)) | flatten | unique | .[]' feature_list.json 2>/dev/null)
  [[ -n "$dupes" ]] && fail "feature_list.json duplicate ids: $dupes"
  bad=$(jq -r '.[] | select((.id|type)!="string" or (.verification|type)!="string" or (.verification|length)==0 or (.passes|type)!="boolean" or (.priority|type)!="number") | .id' feature_list.json)
  [[ -n "$bad" ]] && fail "feature_list.json entries missing id/verification/passes/priority: $bad"
  missing=$(jq -r '[.[].id] as $ids | .[] | select(.depends_on) | .depends_on[] as $d | select($ids | index($d) | not) | $d' feature_list.json)
  [[ -n "$missing" ]] && fail "feature_list.json depends_on unknown ids: $missing"
  [[ -z "$dupes$bad$missing" ]] && ok "feature_list.json entries well-formed"
fi

# ---------------------------------------------------------------------------
hdr "Debug artifacts"
# ---------------------------------------------------------------------------
if grep -nE '(console\.log|\bdebugger\b)' "${SRC_JS[@]}" tests/unit/*.js tests/e2e/*.js tests/architecture/*.js 2>/dev/null; then
  fail "console.log / debugger found (console.error/warn are allowed)"
else
  ok "No debug artifacts"
fi

# ---------------------------------------------------------------------------
hdr "Secret scan (advisory regex — keep in sync with scripts/hooks/pre-commit)"
# ---------------------------------------------------------------------------
SECRET_RE='(AKIA[0-9A-Z]{16}'
SECRET_RE+='|xox[baprs]-[A-Za-z0-9-]{10,}'
SECRET_RE+='|gh[pousr]_[A-Za-z0-9]{36,}'
SECRET_RE+='|github_pat_[A-Za-z0-9_]{22,}'
SECRET_RE+='|-----BEGIN [A-Z ]*PRIVATE KEY-----'
SECRET_RE+='|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}'
SECRET_RE+='|sk-ant-[A-Za-z0-9_-]{20,})'
if git ls-files -co --exclude-standard | grep -vE '^(node_modules|coverage)/' \
     | xargs grep -nE "$SECRET_RE" 2>/dev/null | grep -v 'pragma: allowlist-secret'; then
  fail "Possible secret found — investigate (see SECURITY.md)"
else
  ok "No obvious secret patterns"
fi

# ---------------------------------------------------------------------------
hdr "Dead code (class methods never referenced)"
# ---------------------------------------------------------------------------
# Allowlist: methods intentionally kept for upcoming features. Trim as they ship.
DEAD_ALLOW=()
dead=""
for m in $(grep -oE '^    (async )?_?[a-zA-Z]+\(' script.js | sed -E 's/^ +(async )?//; s/\($//' | sort -u \
           | grep -vE '^(constructor|if|for|while|switch|catch)$'); do
  n=$(cat script.js index.html | grep -ow "$m" | wc -l | tr -d ' ')
  if (( n <= 1 )) && [[ ! " ${DEAD_ALLOW[*]-} " =~ " $m " ]]; then dead+=" $m"; fi
done
[[ -n "$dead" ]] && fail "Unreferenced methods in script.js:$dead  → delete them (and their tests)" || ok "No unreferenced methods"

# ---------------------------------------------------------------------------
hdr "Documentation validity (references must resolve — age is irrelevant)"
# ---------------------------------------------------------------------------
broken=0
for doc in AGENTS.md SECURITY.md; do
  [[ -f "$doc" ]] || { fail "$doc missing"; broken=1; continue; }
  # Markdown links to local files
  while IFS= read -r ref; do
    ref="${ref%%#*}"; [[ -z "$ref" || "$ref" == http* || "$ref" == mailto:* ]] && continue
    [[ -e "$ref" ]] || { fail "$doc links to '$ref' — not found"; broken=1; }
  done < <(grep -oE '\]\([^)]+\)' "$doc" | sed -E 's/^\]\(//; s/\)$//')
  # Backticked paths (contain a slash or a known extension, no spaces)
  while IFS= read -r ref; do
    case "$ref" in http*|*' '*|*'*'*|*'<'*|.git/*|.logs/*|.pids/*|~*|/*) continue ;; esac
    [[ -e "$ref" ]] || { fail "$doc references '$ref' — not found"; broken=1; }
  done < <(grep -oE '`[A-Za-z0-9_./-]+\.(sh|js|json|md|html|css|txt|yml)`|`[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]*`' "$doc" | tr -d '`' | sort -u)
  # npm scripts that must exist
  while IFS= read -r s; do
    jq -e --arg s "$s" '.scripts[$s]' package.json >/dev/null || { fail "$doc mentions 'npm run $s' — no such script"; broken=1; }
  done < <(grep -oE 'npm run [a-z0-9:-]+' "$doc" | awk '{print $3}' | sort -u)
done
[[ -f CLAUDE.md ]] && grep -qx '@AGENTS.md' CLAUDE.md || { fail "CLAUDE.md must contain exactly: @AGENTS.md"; broken=1; }
(( broken == 0 )) && ok "Docs reference only things that exist"

# ---------------------------------------------------------------------------
hdr "Action guardrails"
# ---------------------------------------------------------------------------
S=.claude/settings.json
# Owner decision 2026-10-25 (Zac Harlan): PR-merge and gh-api permissions moved out of the shared
# deny list into the owner's .claude/settings.local.json. Report the state; don't fail on it.
jq -e '.permissions.deny | index("Bash(gh pr merge:*)")' "$S" >/dev/null 2>&1 \
  && ok "$S denies PR merge" || warn "$S does not deny PR merge (owner decision 2026-10-25; the guard hook still blocks it)"
# Owner decision 2026-10-25: pushes allowed without a prompt via .claude/settings.local.json.
# The guard hook + pre-push hook still block force-pushes and pushes to main.
jq -e '.permissions.ask | index("Bash(git push *)")' "$S" >/dev/null 2>&1 \
  && ok "'git push' requires confirmation (survives auto mode)" || warn "No ask rule for 'git push' (owner decision 2026-10-25; main + force-push still blocked by hooks)"
[[ "$(jq -r '.permissions.disableBypassPermissionsMode // ""' "$S")" == "disable" ]] \
  && ok "bypassPermissions mode disabled for this project" || warn "bypassPermissions mode still available"

GUARD=scripts/hooks/guard-destructive-commands.sh
if [[ -x "$GUARD" ]]; then
  # Plain merges are allowed (owner decision 2026-10-25); an admin merge that skips checks is not.
  if echo '{"tool_input":{"command":"cd /tmp && gh pr merge 1 --admin"}}' | bash "$GUARD" >/dev/null 2>&1; then
    fail "$GUARD did NOT block a chained 'gh pr merge --admin'"
  else
    ok "PreToolUse guard blocks chained destructive commands"
  fi
  if gr="$(bash tests/guardrails/run.sh 2>&1)"; then
    ok "$(printf '%s' "$gr" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')"
    gaps=$(printf '%s' "$gr" | grep -c 'OPEN' || true)
    (( gaps > 0 )) && warn "$gaps known guard gap(s) open — feature_list.json: guard-blocks-gh-api-writes"
  else
    fail "Guardrail suite failing → bash tests/guardrails/run.sh"
  fi
else
  fail "$GUARD missing or not executable"
fi

for h in pre-commit commit-msg pre-push; do
  [[ -x ".git/hooks/$h" ]] && ok "git hook installed: $h" || fail "git hook NOT installed: $h → bash init.sh"
done

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  slug=$(git remote get-url origin | sed -E 's#.*github\.com[:/]([^/]+/[^/.]+)(\.git)?#\1#')
  if prot=$(gh api "repos/$slug/branches/main/protection" 2>/dev/null); then
    printf '%s' "$prot" | jq -e '.enforce_admins.enabled == true' >/dev/null 2>&1 \
      && ok "main is protected and admins cannot bypass" \
      || fail "main is protected but enforce_admins is OFF — 'gh pr merge --admin' still works"
  else
    # Needs a human (and CI first) — tracked in feature_list.json, so warn rather than fail.
    warn "main is NOT protected on GitHub (Pages deploys main) — feature_list.json: github-branch-protection"
  fi
else
  warn "gh not authenticated — skipped GitHub protection check"
fi

echo
if (( EXIT == 0 )); then ok "Sweep clean."; else fail "Sweep found issues."; fi
exit "$EXIT"
