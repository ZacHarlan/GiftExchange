# SECURITY.md

## Reporting a vulnerability

This is a personal project. Report issues privately to the maintainer via
[GitHub private vulnerability reporting](https://github.com/ZacHarlan/GiftExchange/security/advisories/new)
rather than a public issue.

## Data handled

- **Classification:** personal/low — participant names, family-group labels and optional wishlist notes.
- Data lives only in the visitor's browser (page memory + `localStorage`). The app makes no network calls
  (enforced by the `no-network-calls` architecture rule). "Email Results" opens the visitor's own mail client via `mailto:`.
- If a change would send this data anywhere, stop and get the maintainer's explicit approval first.

## Known issues

- Names and wishlists are inserted as HTML (`innerHTML`), so pasted markup can run script in that visitor's own
  browser. Tracked as `fix-html-injection` in `feature_list.json` and by the `no-html-interpolation` rule.

## If a secret was committed

The project needs no secrets. If one appears anyway:

1. Don't push. Revoke/rotate the credential at its source immediately.
2. If already pushed, assume it is public — the repo and its GitHub Pages site are public. Rotate first, then clean history.
3. Add the pattern to `scripts/hooks/pre-commit` and `quality-sweep.sh`.

## Sensitive paths

Authoritative list: [AGENTS.md](AGENTS.md) → `SECURITY_SENSITIVE_PATHS`. Changes need a human reviewer, recorded in
`claude-progress.txt` and asserted with a `SECURITY-REVIEW: <name>` commit trailer.

## Agent-generated commits

Agent sessions are logged in `claude-progress.txt` (model + date). Agent commits carry a `Co-Authored-By` trailer.
