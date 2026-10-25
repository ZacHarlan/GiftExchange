#!/usr/bin/env bash
# tests/guardrails/run.sh — proves the action guardrails BLOCK, not merely exist.
#
# A guard with a broken regex passes every "is the file there?" check and stops
# nothing. This suite is the difference between a control and a decoration.
# Wire it into quality-sweep.sh and CI.
#
# Usage: bash tests/guardrails/run.sh

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0")"

GUARD="scripts/hooks/guard-destructive-commands.sh"
PASS=0; FAIL=0

red()   { printf "\033[1;31m%s\033[0m\n" "$*"; }
green() { printf "\033[1;32m%s\033[0m\n" "$*"; }

# In CI the guard only exists once scripts/hooks/ is committed (that needs a
# SECURITY-REVIEW sign-off). Until then, say so loudly instead of failing the build.
if [[ ! -e "$GUARD" && -n "${CI:-}" ]] && ! git ls-files --error-unmatch "$GUARD" >/dev/null 2>&1; then
  echo "::warning::$GUARD is not committed yet — guardrail self-test skipped in CI."
  exit 0
fi

if [[ ! -x "$GUARD" ]]; then
  red "FATAL: $GUARD missing or not executable."
  echo "  → chmod +x $GUARD"
  exit 1
fi

# expect: block | allow
check() {
  local expect="$1" cmd="$2" rc
  # shellcheck disable=SC2016
  printf '{"tool_name":"Bash","tool_input":{"command":%s}}' \
    "$(printf '%s' "$cmd" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/')" \
    | bash "$GUARD" >/dev/null 2>&1
  rc=$?
  if { [[ "$expect" == "block" && $rc -eq 2 ]] || [[ "$expect" == "allow" && $rc -eq 0 ]]; }; then
    printf "  \033[32mPASS\033[0m  [%s] %s\n" "$expect" "$cmd"; PASS=$((PASS+1))
  else
    printf "  \033[31mFAIL\033[0m  [expected %s, rc=%s] %s\n" "$expect" "$rc" "$cmd"; FAIL=$((FAIL+1))
  fi
}

echo "── Must BLOCK ─────────────────────────────────────────────────────"
# Merging: plain merges are allowed in this repo (owner decision 2026-10-25), but
# admin/bypass merges that skip GitHub's checks are not — in any wrapper shape.
check block "gh pr merge 42 --admin --squash"
check block "cd /some/repo && gh pr merge 42 --admin"  # deny-list prefix evasion
check block "bash -c 'gh pr merge 42 --admin'"         # wrapper evasion
check block "gh pr review 42 --approve"
check block "gh api -X PUT repos/o/r/pulls/1/merge"
check block "gh api -X DELETE repos/o/r/branches/main/protection"

# Protected branches
check block "git push origin main"
check block "git push origin HEAD:main"
check block "git push origin :main"
check block "git push --force origin feature"
check block "git push -f origin develop"
check block "git reset --hard origin/main"
check block "git filter-branch --tree-filter x"

# Gate bypass
check block "git commit --no-verify -m 'wip'"
check block "HUSKY=0 git commit -m x"

# Deploys / releases
check block "az webapp deploy -g prod-rg -n myapp"
check block "terraform apply -auto-approve"
check block "pulumi up --yes"
check block "kubectl apply -f k8s/prod.yaml"
check block "helm upgrade myapp ./chart"
check block "gh workflow run deploy.yml"
check block "gh release create v1.2.3"
check block "npm publish"
check block "docker push myregistry.azurecr.io/app:latest"

# Databases outside localhost
check block "sqlcmd -S prod-sql01 -d Falcon -i cleanup.sql"
check block "dotnet ef database update --connection 'Server=prod-sql01'"

# This repo: GitHub Pages publishes main, so main is production
check block "git push upstream HEAD:main"
check block "bash -c 'git push --force origin feat/x'"

# Filesystem
check block "rm -rf ~/"
check block "git clean -fdx"

echo
echo "── Must ALLOW (no false positives — a noisy guard gets disabled) ───"
check allow "dotnet build --no-restore"
check allow "dotnet test --filter Category=Unit"
check allow "dotnet publish -o ./publish"
check allow "dotnet ef database update --connection 'Server=localhost,1433'"
check allow "npm ci"
check allow "npm run build"
check allow "npm test"
check allow "git status"
check allow "git diff HEAD~1"
check allow "git add ."
check allow "git push origin feat/my-feature"
check allow "git push -u origin fix/bug-123"
check allow "gh pr create --fill"
check allow "gh pr merge 1 --merge"
check allow "gh pr merge 1 --squash --delete-branch"
check allow "gh pr view 42"
check allow "gh pr checks 42"
check allow "gh run list"
check allow "bash init.sh"
check allow "bash quality-sweep.sh"
check allow "grep -rn TODO src/"
check allow "bash init.sh --stop"
check allow "bash agent-status.sh"
check allow "npm run test:e2e"
check allow "npx jest tests/architecture"
check allow "node scripts/serve.js"
check allow "gh api repos/ZacHarlan/GiftExchange/pages"

echo
echo "── Known gaps (reported, not failing — see feature_list.json 'guard-blocks-gh-api-writes') ──"
# These SHOULD be blocked but the guard can't yet; fixing it needs an approved edit to
# scripts/hooks/. When a gap starts blocking, move it up into "Must BLOCK".
GAPS=0
for cmd in "cd /tmp && gh api -X PUT repos/o/r/pages" "cd /tmp && gh api -X PATCH repos/o/r -f visibility=private"; do
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$cmd" | bash "$GUARD" >/dev/null 2>&1
  if [[ $? -eq 2 ]]; then
    printf "  \033[32mCLOSED\033[0m %s  → move this into Must BLOCK\n" "$cmd"
  else
    printf "  \033[33mOPEN\033[0m   %s\n" "$cmd"; GAPS=$((GAPS+1))
  fi
done

echo
if (( FAIL == 0 )); then
  green "Guardrail tests: ${PASS} passed, 0 failed."
  exit 0
else
  red "Guardrail tests: ${PASS} passed, ${FAIL} FAILED."
  red "A failing BLOCK case means that action is currently reachable by an agent."
  exit 1
fi
