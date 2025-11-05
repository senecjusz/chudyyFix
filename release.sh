#!/usr/bin/env bash
set -euo pipefail

# Usage: ./release.sh [branch] [version] [remote] [main] ["commit message"]
# Example: ./release.sh linki 0.4.3 origin main "allfixes: v0.4.3 — panel export/import, hide ⚙️, live refresh"

BRANCH="${1:-linki}"
VERSION="${2:-}"
REMOTE="${3:-origin}"
MAIN_BRANCH="${4:-main}"
MESSAGE="${5:-}"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not a git repository. Run inside your repo."
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  echo "Missing version. Usage: ./release.sh linki 0.4.3"
  exit 2
fi

if [[ -z "$MESSAGE" ]]; then
  MESSAGE="release: v$VERSION"
fi

# Fetch everything (including tags)
git fetch --all --prune --tags

# Ensure branch exists locally or on remote
if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
    git checkout -b "$BRANCH" --track "$REMOTE/$BRANCH"
  else
    git checkout -b "$BRANCH"
  fi
else
  git checkout "$BRANCH"
fi

# Rebase feature branch on remote (if exists)
git pull --rebase "$REMOTE" "$BRANCH" || true

# Stage and commit ALL changes if any
if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$MESSAGE"
else
  echo "No changes detected. Skipping commit."
fi

# Push feature branch
git push -u "$REMOTE" "$BRANCH"

# Merge to main with no-ff
git checkout "$MAIN_BRANCH"
git pull --rebase "$REMOTE" "$MAIN_BRANCH"
git merge --no-ff "$BRANCH" -m "Merge $BRANCH: v$VERSION"
git push "$REMOTE" "$MAIN_BRANCH"

# Create annotated tag if it does not exist
TAG="v$VERSION"
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Skipping tag creation."
else
  git tag -a "$TAG" -m "$MESSAGE"
  git push "$REMOTE" "$TAG"
fi

echo "Done. Released $TAG from $BRANCH into $MAIN_BRANCH."
