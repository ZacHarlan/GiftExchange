#!/usr/bin/env bash
# init.sh — one-command bootstrap for the Gift Exchange app.
#
#   bash init.sh          # install what's missing, install git hooks, start dev server, wait for health
#   bash init.sh --stop   # stop everything this script started
#
# Idempotent: safe to run any number of times.

set -euo pipefail
IFS=$'\n\t'
cd "$(dirname "$0")"

PROJECT_NAME="Gift Exchange"
PORT="${PORT:-8085}"
BASE_URL="http://localhost:${PORT}"
HEALTH_URL="${BASE_URL}/health"
HEALTH_TIMEOUT_SECS=15
MIN_NODE_MAJOR=18

log()  { printf "\033[1;34m[init]\033[0m %s\n" "$*"; }
ok()   { printf "\033[1;32m[ ok ]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[fail]\033[0m %s\n" "$*" >&2; exit 1; }

kill_port() {
  local port="$1" pids pid
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  for pid in $pids; do
    # Only touch processes owned by the current user.
    if [[ "$(ps -o user= -p "$pid" 2>/dev/null | tr -d ' ')" == "$USER" ]]; then
      log "Stopping stale process on port $port (PID $pid)"
      kill "$pid" 2>/dev/null || true
      sleep 0.3
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    else
      warn "Port $port is held by another user's process (PID $pid) — not touching it."
    fi
  done
}

if [[ "$(id -u)" == "0" || -n "${SUDO_USER:-}" ]]; then
  die "Do not run init.sh as root or with sudo. Run it as your normal user."
fi

# ---------------------------------------------------------------------------
# --stop
# ---------------------------------------------------------------------------
if [[ "${1:-}" == "--stop" ]]; then
  log "Stopping $PROJECT_NAME"
  if [[ -f .pids/server.pid ]]; then
    pid="$(cat .pids/server.pid)"
    if kill -0 "$pid" 2>/dev/null; then
      log "Stopping dev server (PID $pid)"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f .pids/server.pid
  fi
  kill_port "$PORT"
  ok "Stopped. Start again with: bash init.sh"
  exit 0
fi

log "Bootstrapping $PROJECT_NAME"

# ---------------------------------------------------------------------------
# 1. Toolchain
# ---------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js not found. Install the LTS from https://nodejs.org and re-run."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= MIN_NODE_MAJOR )) || die "Node $node_major is too old; need >= $MIN_NODE_MAJOR."
ok "node $(node --version), npm $(npm --version)"

# ---------------------------------------------------------------------------
# 2. Dependencies (only reinstall when the installed tree doesn't match the lockfile)
# ---------------------------------------------------------------------------
if npm ls --depth=0 >/dev/null 2>&1; then
  ok "npm dependencies already match package-lock.json"
else
  log "Installing npm dependencies (npm ci)"
  npm ci --no-audit --no-fund
  ok "npm dependencies installed"
fi

# Playwright's browser binary lives outside the repo; install it only if missing.
if node -e 'process.exit(require("fs").existsSync(require("@playwright/test").chromium.executablePath()) ? 0 : 1)' 2>/dev/null; then
  ok "Playwright chromium present"
else
  log "Installing Playwright chromium (one-time download)"
  if npx playwright install chromium; then
    ok "Playwright chromium installed"
  else
    warn "Could not install Playwright chromium — e2e tests (npm run test:e2e) won't run until it is."
  fi
fi

# ---------------------------------------------------------------------------
# 3. Git hooks (symlinks so updates to scripts/hooks apply automatically)
# ---------------------------------------------------------------------------
if [[ -d .git ]]; then
  for h in pre-commit commit-msg pre-push; do
    if [[ -f "scripts/hooks/$h" ]]; then
      ln -sf "../../scripts/hooks/$h" ".git/hooks/$h"
      chmod +x "scripts/hooks/$h"
    fi
  done
  ok "git hooks installed (pre-commit, commit-msg, pre-push)"
fi

# ---------------------------------------------------------------------------
# 4. Start the dev server
# ---------------------------------------------------------------------------
mkdir -p .logs .pids
kill_port "$PORT"
PORT="$PORT" nohup node scripts/serve.js > .logs/server.log 2>&1 &
echo $! > .pids/server.pid

# ---------------------------------------------------------------------------
# 5. Wait for real health (HTTP 200), then check the app page itself
# ---------------------------------------------------------------------------
elapsed=0
until curl -fsS -o /dev/null "$HEALTH_URL" 2>/dev/null; do
  if ! kill -0 "$(cat .pids/server.pid)" 2>/dev/null; then
    tail -20 .logs/server.log >&2 || true
    die "Dev server exited during startup — see .logs/server.log"
  fi
  (( elapsed >= HEALTH_TIMEOUT_SECS )) && die "Timed out after ${HEALTH_TIMEOUT_SECS}s waiting for $HEALTH_URL"
  sleep 0.5; elapsed=$((elapsed + 1))
done
ok "$HEALTH_URL is healthy"

curl -fsS "$BASE_URL/" | grep -q 'id="shuffleBtn"' || die "$BASE_URL/ did not return the app page"
ok "$BASE_URL/ serves the app"

echo
ok "Bootstrap complete"
echo "  App:     $BASE_URL"
echo "  Health:  $HEALTH_URL"
echo "  PID:     $(cat .pids/server.pid)  (.pids/server.pid)"
echo "  Log:     .logs/server.log"
echo
echo "Next: bash agent-status.sh"
