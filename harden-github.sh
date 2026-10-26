#!/usr/bin/env bash
# harden-github.sh — Layer 3 of 3: server-side guardrails.
#
# This is the only layer an agent (or a developer in a hurry) cannot bypass.
# Layers 1 and 2 live in files on the developer's laptop; anyone can edit them,
# and `--dangerously-skip-permissions` turns Layer 1 off entirely. GitHub does
# not care what runs locally — if `main` requires a review, `gh pr merge` fails
# at the API, full stop.
#
# Treat Layers 1 and 2 as fast feedback that keeps agents out of trouble, and
# THIS as the control you actually rely on.
#
# Usage:
#   bash harden-github.sh <owner>/<repo>            # apply
#   bash harden-github.sh <owner>/<repo> --dry-run  # show what would change
#
# Requires: gh CLI, authenticated with admin rights on the repo.

set -uo pipefail

REPO="${1:-}"
DRY_RUN=false
[[ "${2:-}" == "--dry-run" ]] && DRY_RUN=true

if [[ -z "$REPO" ]]; then
  echo "usage: bash harden-github.sh <owner>/<repo> [--dry-run]" >&2
  exit 1
fi

# TUNE THESE before running.
# REQUIRED_CHECK must match the CI job name exactly (docs/proposals/ci.yml → job "test").
# Do not apply until that workflow exists on main, or every PR will wait on a check that never runs.
REQUIRED_CHECK="${REQUIRED_CHECK:-test}"
# Solo repo: GitHub never lets you approve your own PR, so with enforce_admins on,
# REQUIRED_REVIEWS=1 would make merging impossible. 0 still forces every change
# through a PR + green CI. Set REQUIRED_REVIEWS=1 once a second person can review.
REQUIRED_REVIEWS="${REQUIRED_REVIEWS:-0}"
DEFAULT_BRANCH="main"
if (( REQUIRED_REVIEWS > 0 )); then LAST_PUSH=true; else LAST_PUSH=false; fi

say()  { printf "\033[36m[harden]\033[0m %s\n" "$*"; }
ok()   { printf "\033[32m[ ok ]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[warn]\033[0m %s\n" "$*"; }

run() {
  if $DRY_RUN; then
    printf "\033[90m  would run: %s\033[0m\n" "$*"
  else
    "$@"
  fi
}

command -v gh >/dev/null 2>&1 || { echo "gh CLI not found" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated — run: gh auth login" >&2; exit 1; }

say "Target: $REPO (branch: $DEFAULT_BRANCH)"
$DRY_RUN && warn "DRY RUN — nothing will be changed"

# ---------------------------------------------------------------------------
say "1/4  Branch protection on '$DEFAULT_BRANCH'"
# ---------------------------------------------------------------------------
# enforce_admins:true is the load-bearing field. Without it, anyone with admin
# (which on most small teams is everyone) can `gh pr merge --admin` straight
# through every rule below, and agents WILL find that flag.
protection=$(cat <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["$REQUIRED_CHECK"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": $REQUIRED_REVIEWS,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": $LAST_PUSH
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "required_linear_history": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
)

if $DRY_RUN; then
  printf "\033[90m  would PUT repos/%s/branches/%s/protection:\033[0m\n%s\n" \
    "$REPO" "$DEFAULT_BRANCH" "$protection"
else
  if printf '%s' "$protection" | gh api -X PUT \
       "repos/$REPO/branches/$DEFAULT_BRANCH/protection" \
       -H "Accept: application/vnd.github+json" --input - >/dev/null 2>&1; then
    ok "Branch protection applied (reviews: $REQUIRED_REVIEWS, admins included, force-push off)"
  else
    warn "Failed. Needs admin rights; on private repos this needs GitHub Team/Enterprise."
  fi
fi

# `require_last_push_approval` is the specific setting that stops the most
# common agent accident: agent opens PR, human approves, agent pushes three
# more commits, agent merges. With it on, the new commits void the approval.

# ---------------------------------------------------------------------------
say "2/4  Deployment environments with required reviewers"
# ---------------------------------------------------------------------------
# A GitHub Environment with required reviewers means a deploy job PAUSES and
# waits for a human click. This is what makes "agent accidentally deployed to
# production" structurally impossible rather than merely discouraged.
# This repo deploys via GitHub Pages, whose deploys run in the "github-pages" environment.
for env in github-pages; do
  reviewers_note=" (optionally add a required reviewer in the UI — see note below)"
  run gh api -X PUT "repos/$REPO/environments/$env" \
      -H "Accept: application/vnd.github+json" >/dev/null 2>&1 \
    && ok "Environment '$env' exists$reviewers_note" \
    || warn "Could not create environment '$env'"
done

cat <<'NOTE'

  ACTION REQUIRED (cannot be fully scripted):
    Settings → Environments → github-pages → Deployment protection rules
      [x] Deployment branches     → Selected branches → main only
      [ ] Required reviewers      → optional for a solo repo (you'd approve each Pages deploy)
    This app has no secrets, so there is nothing to move into the environment.

NOTE

# ---------------------------------------------------------------------------
say "3/4  Repository-level settings"
# ---------------------------------------------------------------------------
run gh api -X PATCH "repos/$REPO" \
    -f allow_auto_merge=false \
    -f delete_branch_on_merge=true \
    -f allow_update_branch=true \
    >/dev/null 2>&1 \
  && ok "auto-merge disabled, branch cleanup on" \
  || warn "Could not update repo settings"

# allow_auto_merge=false matters more than it looks: with auto-merge on, an
# agent can queue a merge that fires later with no human present.

run gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
    -f default_workflow_permissions=read \
    -F can_approve_pull_request_reviews=false \
    >/dev/null 2>&1 \
  && ok "GITHUB_TOKEN scoped read-only; workflows cannot approve PRs" \
  || warn "Could not restrict workflow permissions"

# ---------------------------------------------------------------------------
say "4/4  Secret scanning and push protection"
# ---------------------------------------------------------------------------
run gh api -X PATCH "repos/$REPO" \
    -f 'security_and_analysis[secret_scanning][status]=enabled' \
    -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled' \
    >/dev/null 2>&1 \
  && ok "Secret scanning + push protection enabled" \
  || warn "Not available (needs GitHub Advanced Security on private repos)"

echo
say "Verify with:"
echo "  gh api repos/$REPO/branches/$DEFAULT_BRANCH/protection | jq '{admins:.enforce_admins.enabled, reviews:.required_pull_request_reviews.required_approving_review_count, force:.allow_force_pushes.enabled}'"
echo
say "Then confirm the gate actually bites — this MUST fail:"
echo "  git switch $DEFAULT_BRANCH && git commit --allow-empty --no-verify -m test && git push --no-verify  # then: git reset --soft HEAD~1"
