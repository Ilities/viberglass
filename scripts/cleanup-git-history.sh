# Git History Cleanup Script
# 
# WARNING: This script rewrites git history. DO NOT run this on a shared branch.
# Only run on a local branch before the initial public release.
#
# Usage:
#   ./scripts/cleanup-git-history.sh
#
# This script will:
# 1. Identify WIP, fixup, and squash commits
# 2. Create an interactive rebase todo file
# 3. Guide you through squashing cleanup commits

#!/bin/bash

set -e

echo "=== Git History Cleanup ==="
echo ""
echo "WARNING: This will rewrite git history!"
echo "Only run this on a local branch before public release."
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Find cleanup commits
echo ""
echo "Finding WIP, fixup, and squash commits..."
echo ""

git log --all --oneline --grep="WIP\|fixup\|squash\|temp\|cleanup\|tweak\|modify\|More\|Fix " | head -50

echo ""
echo "Found the commits above that might need cleanup."
echo ""
echo "To interactively rebase and clean these up, run:"
echo "  git rebase -i HEAD~713"
echo ""
echo "In the editor, change 'pick' to 'squash' or 'fixup' for commits that"
echo "should be combined with their predecessors."
echo ""
echo "Alternative: Use git filter-branch or BFG Repo-Cleaner for more"
echo "aggressive history rewriting."
echo ""
echo "For now, creating a backup branch..."

BACKUP_BRANCH="backup-before-cleanup-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"

echo "Backup created: $BACKUP_BRANCH"
echo ""
echo "You can now run:"
echo "  git rebase -i main"
echo ""
echo "Or to automatically squash fixup commits:"
echo "  git rebase -i --autosquash main"
echo ""
echo "After rebasing, force push (if this is your local main):"
echo "  git push --force-with-lease origin main"
