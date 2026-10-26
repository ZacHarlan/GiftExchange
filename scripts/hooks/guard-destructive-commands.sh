#!/usr/bin/env bash
# guard-destructive-commands.sh — Claude Code PreToolUse hook (Layer 2 of 3).
#
# Why this exists even though .claude/settings.json already has a deny list:
# deny rules are PREFIX matches against the command string. They do not see
# inside compound commands. All of these slip past a `Bash(gh pr merge:*)` rule:
#
#     cd /repo && gh pr merge 42 --admin
#     bash -c "gh pr merge 42"
#     M=merge; gh pr $M 42
#     eval "gh pr merge 42"
#
# This hook regex-scans the WHOLE command string, so placement and chaining do
# not matter.
#
# Wire it up in .claude/settings.json:
#   "hooks": { "PreToolUse": [ { "matcher": "Bash",
#     "hooks": [ { "type": "command",
#       "command": "$CLAUDE_PROJECT_DIR/scripts/hooks/guard-destructive-commands.sh" } ] } ] }
#
# Contract: exit 0 = allow, exit 2 = BLOCK (stderr is shown to the agent),
# any other exit = non-blocking error. Never exit 1 here.

set -uo pipefail

payload=$(cat)

# Extract the command without requiring jq (jq is not on every Windows dev box).
if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
else
  cmd=$(printf '%s' "$payload" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')
fi

[[ -z "$cmd" ]] && exit 0

# Normalize: collapse whitespace, strip line continuations. Makes the patterns
# below immune to formatting tricks.
norm=$(printf '%s' "$cmd" | tr '\n' ' ' | sed 's/\\ / /g; s/[[:space:]]\+/ /g')

block() {
  cat >&2 <<EOF
BLOCKED by scripts/hooks/guard-destructive-commands.sh

  Command : $cmd
  Rule    : $1
  Why     : $2

This is a human-only action. Do not attempt to work around it — do not retry
with different syntax, do not edit this hook, do not edit .claude/settings.json.

What to do instead:
  $3
EOF
  exit 2
}

# --------------------------------------------------------------------------
# 1. Merging pull requests — the #1 reported incident
# --------------------------------------------------------------------------
# Owner decision 2026-10-25 (Zac Harlan): agents MAY merge PRs in this repo, after CI is
# green (see AGENTS.md). Admin/bypass merges stay blocked by section 3 (--admin, --bypass).

if [[ "$norm" =~ gh[[:space:]]+pr[[:space:]]+review.*--approve ]]; then
  block "no agent-initiated PR approvals" \
        "An agent approving its own work defeats the review gate entirely." \
        "Summarize your review as a comment; a human approves."
fi

# gh api used to merge, or to weaken branch protection
if [[ "$norm" =~ gh[[:space:]]+api ]] && \
   [[ "$norm" =~ (pulls/[0-9]+/merge|/merge|branches/[^[:space:]]+/protection|/deployments|/environments) ]]; then
  block "no merge/protection changes via the raw GitHub API" \
        "Reaching the same endpoint through 'gh api' is still the blocked action." \
        "Ask a human to perform this in the GitHub UI."
fi

# --------------------------------------------------------------------------
# 2. Writing to protected branches
# --------------------------------------------------------------------------
PROTECTED='(main|master|trunk|develop|release(/[^[:space:]]*)?|prod|production)'

if [[ "$norm" =~ git[[:space:]]+push ]]; then
  if [[ "$norm" =~ (--force|--force-with-lease|[[:space:]]-f([[:space:]]|$)) ]]; then
    block "no force-push, ever" \
          "Force-push rewrites shared history and can destroy other people's commits." \
          "If history needs fixing, hand the branch to a human."
  fi
  if [[ "$norm" =~ (origin|upstream)?[[:space:]]*:?$PROTECTED([[:space:]]|$) ]] || \
     [[ "$norm" =~ HEAD:$PROTECTED ]]; then
    block "no direct push to a protected branch" \
          "Protected branches change only through a reviewed pull request." \
          "Push your feature branch, then 'gh pr create'."
  fi
  # A BARE 'git push' while standing on a protected branch is the same accident
  # — git resolves the target from HEAD. Only applies when no refspec is given;
  # 'git push origin feat/x' from main is explicit and fine.
  # Note: no empty alternation branch in the grep below — BSD grep (macOS,
  # Git for Windows) rejects `(a|b|)` with "empty (sub)expression", which would
  # make has_refspec always empty and block every push.
  push_args=$(printf '%s' "$norm" | sed 's/.*git[[:space:]]*push//' | sed 's/--[a-z-]*//g')
  has_refspec=$(printf '%s' "$push_args" | tr ' ' '\n' \
                  | grep -v '^$' \
                  | grep -vE '^(origin|upstream|-u|-q|-v)$' | head -1)
  if [[ -z "$has_refspec" ]]; then
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [[ "$branch" =~ ^$PROTECTED$ ]]; then
      block "no bare push while checked out on '$branch'" \
            "'git push' with no refspec pushes HEAD straight to the protected branch." \
            "git switch -c feat/<slug>  # move the work to a branch first"
    fi
  fi
fi

if [[ "$norm" =~ git[[:space:]]+(reset[[:space:]]+--hard|filter-branch|update-ref|reflog[[:space:]]+delete) ]]; then
  block "no destructive history rewriting" \
        "These silently discard committed work with no undo." \
        "Use 'git revert', or hand it to a human."
fi

# --------------------------------------------------------------------------
# 3. Bypassing the safety tooling
# --------------------------------------------------------------------------
if [[ "$norm" =~ (--no-verify|--no-gpg-sign|git[[:space:]]+commit[^|]*[[:space:]]-[a-zA-Z]*n|HUSKY=0|SKIP_HOOKS|--admin|--bypass) ]]; then
  block "no bypassing commit/merge gates" \
        "The gates exist because reviews get skipped under time pressure. Turning them off is never the fix." \
        "Fix what the gate is complaining about."
fi

# --------------------------------------------------------------------------
# 4. Deploying / publishing to a live environment
# --------------------------------------------------------------------------
if [[ "$norm" =~ (az[[:space:]]+(webapp|functionapp|containerapp)[[:space:]]+(deploy|deployment|up)) ]] || \
   [[ "$norm" =~ (msdeploy|Publish-AzWebApp|az[[:space:]]+group[[:space:]]+delete) ]] || \
   [[ "$norm" =~ (terraform[[:space:]]+(apply|destroy)|pulumi[[:space:]]+(up|destroy)) ]] || \
   [[ "$norm" =~ (kubectl[[:space:]]+(apply|delete|rollout)|helm[[:space:]]+(install|upgrade|uninstall)) ]] || \
   [[ "$norm" =~ (gh[[:space:]]+workflow[[:space:]]+run|gh[[:space:]]+release[[:space:]]+create) ]] || \
   [[ "$norm" =~ (npm[[:space:]]+publish|docker[[:space:]]+push|dotnet[[:space:]]+nuget[[:space:]]+push) ]]; then
  block "no agent-initiated deploys or releases" \
        "Deploying is an operational decision with blast radius outside this repo." \
        "Prepare the change, then ask a human to trigger the deploy."
fi

# dotnet publish is fine locally; blocked when it targets a server/share.
if [[ "$norm" =~ dotnet[[:space:]]+publish ]] && \
   [[ "$norm" =~ (\\\\|//[a-zA-Z0-9.-]+/|/p:PublishProfile|--output[[:space:]]+[A-Z]:|inetpub|wwwroot) ]]; then
  block "no publishing to a deployment target" \
        "'dotnet publish' to a UNC path or publish profile IS a deploy." \
        "Publish to a local ./publish directory instead."
fi

# --------------------------------------------------------------------------
# 5. Touching a non-local database
# --------------------------------------------------------------------------
if [[ "$norm" =~ (sqlcmd|Invoke-Sqlcmd|bcp|osql) ]] || \
   [[ "$norm" =~ dotnet[[:space:]]+ef[[:space:]]+database ]]; then
  if [[ ! "$norm" =~ (localhost|127\.0\.0\.1|\(localdb\)|tcp:localhost) ]] || \
     [[ "$norm" =~ (prod|production|-prod|PROD) ]]; then
    block "no database commands outside localhost" \
          "A migration or script against a shared/production database is unrecoverable from here." \
          "Point it at localhost, or hand the script to a DBA."
  fi
fi

# --------------------------------------------------------------------------
# 6. Blunt filesystem destruction
# --------------------------------------------------------------------------
if [[ "$norm" =~ rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*[rR])[[:space:]]+(/|~|\$HOME|\*) ]] || \
   [[ "$norm" =~ git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*x ]]; then
  block "no recursive delete of a home or root path" \
        "Not recoverable." \
        "Delete a specific, named subdirectory instead."
fi

exit 0
