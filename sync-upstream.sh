#!/usr/bin/env bash
# Sync this checkout with upstream open-webui without clobbering local work.
#
# What it does:
#   1. gh repo sync  -> fast-forwards YOUR fork's branch on GitHub from upstream
#   2. git fetch     -> pulls those commits down locally
#   3. stash         -> parks uncommitted work (tracked + untracked)
#   4. merge         -> merges upstream into your current branch (never --force)
#   5. stash pop     -> restores your work on top
#
# Nothing here rewrites history or discards changes. If the merge conflicts,
# the script stops and leaves the stash intact so you can resolve by hand.

set -euo pipefail

# ---------------------------------------------------------------- CONFIG ----
UPSTREAM_REPO="open-webui/open-webui"   # source of truth on GitHub
FORK_REPO="mporenta/open-webui"         # your fork on GitHub
UPSTREAM_REMOTE="origin"                # local remote pointing at UPSTREAM_REPO
FORK_REMOTE="fork"                      # local remote pointing at FORK_REPO
UPSTREAM_BRANCH="main"                  # branch to sync from
SYNC_FORK_ON_GITHUB=true                # run `gh repo sync` on the fork
PUSH_AFTER_MERGE=false                  # push merged branch back to the fork
# -----------------------------------------------------------------------------

say() { printf '\n== %s\n' "$*"; }

command -v gh >/dev/null || { echo "gh CLI not found"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated: run 'gh auth login'"; exit 1; }

cd "$(git rev-parse --show-toplevel)"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "HEAD" ] && { echo "Detached HEAD. Run 'git switch -c <branch>' first."; exit 1; }
say "Working branch: $BRANCH"

if [ "$SYNC_FORK_ON_GITHUB" = true ]; then
  say "Syncing $FORK_REPO:$UPSTREAM_BRANCH from $UPSTREAM_REPO"
  # No --force: gh refuses rather than discarding fork commits.
  gh repo sync "$FORK_REPO" --source "$UPSTREAM_REPO" --branch "$UPSTREAM_BRANCH" \
    || echo "  fork branch has diverged; continuing with a local merge instead"
fi

say "Fetching remotes"
git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"
git remote get-url "$FORK_REMOTE" >/dev/null 2>&1 && git fetch "$FORK_REMOTE" || true

STASHED=false
if [ -n "$(git status --porcelain)" ]; then
  say "Stashing local changes (including untracked)"
  git stash push --include-untracked --message "sync-upstream $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  STASHED=true
fi

say "Merging $UPSTREAM_REMOTE/$UPSTREAM_BRANCH into $BRANCH"
if ! git merge --no-edit "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"; then
  echo
  echo "Merge conflict. Your changes are safe in the stash:"
  git stash list | head -1
  echo "Resolve conflicts, 'git commit', then 'git stash pop'."
  exit 1
fi

if [ "$STASHED" = true ]; then
  say "Restoring local changes"
  if ! git stash pop; then
    echo
    echo "Conflicts while restoring. Stash kept:"
    git stash list | head -1
    exit 1
  fi
fi

if [ "$PUSH_AFTER_MERGE" = true ]; then
  say "Pushing $BRANCH to $FORK_REMOTE"
  git push "$FORK_REMOTE" "$BRANCH"
fi

say "Done"
git --no-pager log --oneline -3
git status --short
