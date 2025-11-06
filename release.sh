#!/usr/bin/env bash
set -euo pipefail

# Usage: ./release.sh [branch] [version] [remote] [main] ["commit message"]
# Example: ./release.sh linki 0.4.3 origin main "allfixes: v0.4.3 - panel export/import, hide gear, live refresh"

BRANCH="${1:-linki}"
VERSION="${2:-}"
REMOTE="${3:-origin}"
MAIN_BRANCH="${4:-main}"
MESSAGE="${5:-}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "[ERROR] Not a git repository. Run inside your repo."
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  echo "[ERROR] Missing version. Usage: ./release.sh linki 0.4.3"
  exit 2
fi

if [[ -z "$MESSAGE" ]]; then
  MESSAGE="release: v$VERSION"
fi

TAG="v$VERSION"

echo "[INFO] Fetching all refs (heads/tags) and pruning..."
git fetch --all --prune --tags

# Ensure working on feature branch
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git checkout "$BRANCH"
elif git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  git checkout -b "$BRANCH" --track "$REMOTE/$BRANCH"
else
  git checkout -b "$BRANCH"
fi

# Commit local changes on feature branch if present (avoid dirty pull)
if [[ -n "$(git status --porcelain)" ]]; then
  echo "[INFO] Staging and committing local changes on $BRANCH..."
  git add -A
  git commit -m "$MESSAGE"
else
  echo "[INFO] No local changes to commit on $BRANCH."
fi

# Rebase feature branch on remote (clean tree now)
if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
  echo "[INFO] Rebasing $BRANCH on $REMOTE/$BRANCH..."
  git pull --rebase "$REMOTE" "$BRANCH"
fi

# Push feature branch (creates remote branch if missing)
echo "[INFO] Pushing feature branch $BRANCH..."
git push -u "$REMOTE" "$BRANCH"

# Switch to main and fast-forward to remote
echo "[INFO] Checking out $MAIN_BRANCH..."
git checkout "$MAIN_BRANCH"

echo "[INFO] Pulling $REMOTE/$MAIN_BRANCH with --ff-only..."
git pull --ff-only "$REMOTE" "$MAIN_BRANCH"

# Merge feature branch into main with a merge commit (no-ff for traceability)
echo "[INFO] Merging $BRANCH -> $MAIN_BRANCH (no-ff)..."
git merge --no-ff "$BRANCH" -m "Merge $BRANCH: $MESSAGE"

# Create annotated tag if it does not exist locally
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "[INFO] Tag $TAG already exists locally. Will push it."
else
  echo "[INFO] Creating annotated tag $TAG..."
  git tag -a "$TAG" -m "$MESSAGE"
fi

# Safety check: ensure push is fast-forward relative to remote main
AHEAD_BEHIND="$(git rev-list --left-right --count "$REMOTE/$MAIN_BRANCH...$MAIN_BRANCH")"
LEFT="${AHEAD_BEHIND%% *}"         # commits remote has that local does not
RIGHT="${AHEAD_BEHIND##* }"        # commits local has that remote does not
if [[ "$LEFT" -ne 0 ]]; then
  echo "[ERROR] $MAIN_BRANCH is behind $REMOTE/$MAIN_BRANCH ($LEFT commits)."
  echo "        Someone pushed new commits to remote. Resolve locally, then rerun."
  exit 3
fi

# Atomic push: branch + tag go together or not at all
echo "[INFO] Pushing $MAIN_BRANCH and $TAG atomically..."
git push --atomic "$REMOTE" "$MAIN_BRANCH" "refs/tags/$TAG"

# Final diagnostics
echo "[INFO] Remote main HEAD:"
git ls-remote "$REMOTE" -h "refs/heads/$MAIN_BRANCH" || true

echo "[INFO] Done. Released $TAG from $BRANCH into $MAIN_BRANCH."
