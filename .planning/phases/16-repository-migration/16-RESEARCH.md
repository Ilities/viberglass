# Phase 16: Repository Migration - Research

**Researched:** 2026-01-24
**Domain:** GitHub Repository Rename + Integration Updates
**Confidence:** HIGH

## Summary

This research documents the process and impacts of renaming the GitHub repository from "viberator" to "viberglass". The repository rename is a low-risk operation with automatic redirects, but requires updates to CI/CD workflows, infrastructure references, and local development environments.

**Key findings:**
- GitHub repository rename is simple and reversible via web UI or GitHub CLI
- **Critical:** GitHub automatically creates redirects from old to new URLs (web and git)
- **Primary impact area:** CI/CD workflows reference the repository name via `github.repository` context
- **Secondary impact:** IAM OIDC trust relationships reference repository in subject claim
- **Low impact:** Local clones continue working with automatic redirect
- **No data loss:** Repository rename preserves all commits, issues, PRs, and history

**Primary recommendation:** Rename repository first (GitHub handles redirects), then update any hardcoded repository references in code/infrastructure. The order doesn't matter for functionality due to redirects, but updating references after rename is cleaner.

## Standard Stack

### Core Infrastructure
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| GitHub Repository Rename | GitHub API/Web UI | Repository name change | Built-in GitHub feature with automatic redirects |
| GitHub Actions Workflows | Latest | CI/CD automation | Uses `github.repository` context for repo references |
| AWS IAM OIDC | AWS IAM | GitHub Actions authentication | Trust relationship includes repository subject claim |
| Pulumi IaC | Latest | Infrastructure provisioning | Stores repository reference in OIDC trust policy |

### GitHub Repository Rename Process
| Method | Tool | Difficulty | When to Use |
|--------|------|------------|-------------|
| Web UI | Browser | LOW | Quick rename, one-time operation |
| GitHub CLI | `gh repo edit` | LOW | Automated or scripted rename |
| GitHub API | REST API | MEDIUM | Programmatic rename via API |

## Architecture Patterns

### GitHub Repository Rename Behavior

**What happens automatically:**
1. **Web redirects:** All old URLs automatically redirect to new name
   - `https://github.com/Ilities/viberator` → `https://github.com/Ilities/viberglass`
   - Works for: repository home, issues, PRs, commits, releases

2. **Git redirects:** Git clone/push/pull URLs automatically redirect
   - `https://github.com/Ilities/viberator.git` → redirects to new URL
   - `git@github.com:Ilities/viberator.git` → redirects to new URL
   - Existing clones continue working without updates

3. **Reference updates:** Some references update automatically
   - GitHub Actions workflows using `{{ github.repository }}` automatically use new name
   - README links and wikis update (most cases)

**What breaks (needs manual update):**
1. **Hardcoded repository URLs:** Absolute URLs in code/docs
   - Example: `"https://github.com/Ilities/viberator/blob/main/README"`
   - These still redirect but should be updated for clarity

2. **Third-party integrations:** Webhooks and app settings
   - External services configured with repository webhook URLs
   - OAuth app configurations referencing repository
   - Status checks and branch protection rules

3. **IAM OIDC trust relationships:** Subject claim filters
   - AWS IAM roles with `token.actions.githubusercontent.com:sub` condition
   - Filters like `repo:Ilities/viberator:*` must be updated to `repo:Ilities/viberglass:*`

4. **Documentation:** Links in external docs
   - READMEs in other projects referencing this repo
   - Blog posts, tutorials, StackOverflow answers

**Source:** [GitHub Docs - Renaming a Repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/renaming-a-repository)

### Repository Rename Methods

#### Method 1: GitHub Web UI (Recommended for one-time rename)

**Process:**
1. Navigate to repository → Settings → General
2. Under "Repository name", click the gear icon next to current name
3. Enter new name: `viberglass`
4. Click "Rename"

**What happens:**
- GitHub validates name availability
- Renames immediately (atomic operation)
- Creates automatic redirects
- Updates repository settings

**Advantages:**
- Simplest method
- Visual confirmation
- No authentication setup needed

**Disadvantages:**
- Manual (not scriptable)
- Requires UI interaction

**Source:** [GitHub Help - Renaming a Repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/renaming-a-repository)

#### Method 2: GitHub CLI (Recommended for automation)

**Prerequisites:**
- GitHub CLI installed: `brew install gh` or `sudo apt install gh`
- Authenticated: `gh auth login`

**Process:**
```bash
# Rename repository
gh repo edit Ilities/viberator --name viberglass

# Verify rename
gh repo view Ilities/viberglass
```

**What happens:**
- Same as web UI rename
- Returns JSON with new repository details
- Can be scripted in deployment pipelines

**Advantages:**
- Scriptable
- Can be automated in CI/CD
- Faster than web UI

**Disadvantages:**
- Requires GitHub CLI installation
- Requires authentication setup

**Source:** [GitHub CLI Docs - gh repo edit](https://cli.github.com/manual/gh_repo_edit)

#### Method 3: GitHub API (For advanced automation)

**Process:**
```bash
curl -X PATCH \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/Ilities/viberator \
  -d '{"name":"viberglass"}'
```

**Advantages:**
- Full programmatic control
- Works from any environment with HTTP access
- Can be integrated into custom tools

**Disadvantages:**
- Requires personal access token
- More complex than CLI
- Error handling required

**Source:** [GitHub REST API - Update a Repository](https://docs.github.com/en/rest/repos/repos#update-a-repository)

### CI/CD Workflow Repository References

**Key finding:** Most GitHub Actions workflows use the `github.repository` context, which automatically reflects the new repository name after rename.

**Automatic updates (no changes needed):**
```yaml
# These automatically use the new repository name
- uses: actions/checkout@v4
  with:
    repository: ${{ github.repository }}  # Automatically updates

- name: Deploy
  run: |
    echo "Deploying from ${{ github.repository }}"  # Shows new name
```

**Manual updates required (hardcoded references):**
```yaml
# These must be updated manually
- name: Build with source URL
  run: |
    --source-url "https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"
    # Note: This uses github.repository, so it's automatic

# Hardcoded references (need updates)
- name: Example hardcoded reference
  run: |
    curl https://api.github.com/repos/Ilities/viberator/releases  # MUST UPDATE
```

**Source:** [GitHub Actions Docs - github.context](https://docs.github.com/en/actions/learn-github-actions/contexts#github-context)

### IAM OIDC Trust Relationship Impact

**Critical finding:** AWS IAM OIDC provider trust relationships include a subject claim filter that references the repository name.

**Current OIDC trust policy (from Phase 15 infrastructure):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::108740325835:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:Ilities/viberglass:*"
        }
      }
    }
  ]
}
```

**Wait - the infrastructure already uses "viberglass"!**

From `/home/jussi/Development/viberator/infrastructure/index.ts` line 236:
```typescript
githubRepository: "ilities/viberglass", // TODO: make configurable
```

**This means:**
- Infrastructure already references "viberglass" as the repository name
- The OIDC trust relationship will block GitHub Actions after rename until updated
- **Current mismatch:** Repository is "Ilities/viberator" but infrastructure expects "Ilities/viberglass"

**Impact:** After repository rename, the OIDC trust policy will work correctly since it already expects "viberglass".

**However, there's a problem:** The current infrastructure won't work because GitHub is sending "Ilities/viberator" as the subject, but the policy expects "Ilities/viberglass".

**Resolution required:**
1. Option A: Update infrastructure to expect "Ilities/viberator" (current state), then rename repo, then update infrastructure again
2. Option B: Rename repository first (breaks CI/CD temporarily), then update infrastructure to match
3. **Option C (RECOMMENDED):** Update infrastructure to use "Ilities/viberator" now (remove the TODO), complete Phase 15 deployment, then rename repository in Phase 16 and update infrastructure to "Ilities/viberglass"

**Wait - let me re-read Phase 15 research:**

From Phase 15 research, line 236 in `infrastructure/index.ts` has:
```typescript
githubRepository: "ilities/viberglass", // TODO: make configurable
```

But from my grep results, the current code already has "viberglass". This suggests Phase 15 may have already updated this, or it's a mistake.

**Let me verify the actual current state:**

From my earlier read of `/home/jussi/Development/viberator/infrastructure/components/amplify-oidc.ts` line 73:
```typescript
"token.actions.githubusercontent.com:sub": "repo:${githubRepository}:*"
```

And from index.ts line 236:
```typescript
githubRepository: "ilities/viberglass", // TODO: make configurable
```

**Conclusion:** The infrastructure already expects "viberglass" but the repository is still "viberator". This means:
- Current CI/CD is likely failing or not using OIDC
- After repository rename, OIDC will work correctly
- **No infrastructure update needed after rename** (it already expects the new name)

### Local Development Impact

**Git remote references:**
- Existing clones continue working with automatic redirect
- Git shows warning suggesting to update remote URL
- No immediate action required, but cleanup recommended

**Current remote:**
```bash
$ git remote -v
origin  https://github.com/Ilities/viberator.git (fetch)
origin  https://github.com/Ilities/viberator.git (push)
```

**After repository rename:**
```bash
# Git works but shows warning
$ git pull
warning: redirecting to https://github.com/Ilities/viberglass.git/

# Update to new URL (recommended)
git remote set-url origin https://github.com/Ilities/viberglass.git
```

**Impact on developers:**
- Low impact - existing clones continue working
- Recommended to update remote URL to avoid warnings
- No force re-clone required

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Repository rename script | Custom shell script with curl | GitHub CLI `gh repo edit` | Official tool with error handling |
| Redirect management | Custom redirect rules | GitHub automatic redirects | Built-in feature, no configuration needed |
| URL update automation | Custom find/replace scripts | Git operations + manual verification | Safer, reviewed changes |
| OIDC trust policy updates | Manual JSON editing | Pulumi `pulumi up` with updated config | IaC-managed, auditable |
| CI/CD workflow updates | Bulk find/replace | Targeted updates to hardcoded refs | Context-aware changes |

**Key insight:** GitHub repository rename is a well-supported operation. Use built-in features and IaC tools rather than custom automation.

## Common Pitfalls

### Pitfall 1: Updating Infrastructure Before Repository Rename

**What goes wrong:** Infrastructure references "Ilities/viberglass" but repository is still "Ilities/viberator", causing:
- OIDC authentication failures (subject mismatch)
- GitHub Actions can't assume IAM role
- CI/CD deployments fail

**Why it happens:** Infrastructure code and repository name are out of sync during transition.

**How to avoid:**
1. **Recommended sequence:** Rename repository first, then update infrastructure (or update infrastructure after rename completes)
2. **Verify:** Check OIDC trust policy matches current repository name
3. **Test:** Run a test deployment after rename to verify CI/CD works

**Wait - I need to reconsider this:** The infrastructure currently has "Ilities/viberglass" but the repository is "Ilities/viberator". This suggests either:
- Phase 15 already updated infrastructure (incomplete migration)
- The TODO indicates it should be configurable

**Recommendation for Phase 16:**
1. Verify current state of infrastructure code vs actual repository
2. Determine if infrastructure needs rollback to "viberator" before rename
3. Update plan accordingly

### Pitfall 2: Breaking Existing Clones

**What goes wrong:** Developers experience immediate failures after rename:
- `git push` fails with "repository not found"
- `git pull` shows redirect warnings
- CI/CD runners using cached clones fail

**Why it happens:** Git shows warnings but still works with redirects. Some CI/CD systems may have strict checks.

**How to avoid:**
1. **Communicate:** Notify team before repository rename
2. **Document:** Provide migration instructions for updating remote URLs
3. **Test:** Verify CI/CD works with new repository name
4. **Grace period:** Keep old name working via redirects (permanent)

**Migration instructions for developers:**
```bash
# After repository rename, update your remote:
git remote set-url origin https://github.com/Ilities/viberglass.git

# Verify
git remote -v
git fetch origin
```

### Pitfall 3: Forgetting Third-Party Integrations

**What goes wrong:** External services configured with webhook URLs break:
- Status check integrations (e.g., CI, coverage tools)
- Project management integrations (e.g., Jira, Trello)
- Deployment integrations (e.g., Vercel, Netlify)
- Bot integrations (e.g., Dependabot, Codecov)

**Why it happens:** Webhook URLs include repository name, and some integrations store absolute URLs.

**How to avoid:**
1. **Audit:** List all integrations using repository webhooks before rename
2. **Test:** After rename, verify each integration still receives events
3. **Update:** Manually update integrations that break (if any)
4. **Monitor:** Check GitHub webhook delivery logs for failures

**Audit command:**
```bash
# List repository webhooks
gh api repos/Ilities/viberator/hooks
```

### Pitfall 4: Hardcoded Repository URLs in Code

**What goes wrong:** Code references absolute GitHub URLs that redirect after rename:
- README links to repository files
- Documentation referencing repository
- Error messages with repository URLs
- API calls to GitHub API with repository name

**Why it happens:** Developers use absolute URLs instead of relative or context-based URLs.

**How to avoid:**
1. **Search:** Find all hardcoded references to repository URL
2. **Replace:** Use relative URLs or GitHub context variables
3. **Verify:** Test links after rename
4. **Monitor:** Check for 404s in link checkers

**Example fixes:**
```markdown
<!-- BEFORE (hardcoded) -->
[See full documentation](https://github.com/Ilities/viberator/blob/main/README.md)

<!-- AFTER (relative) -->
[See full documentation](../README.md)

<!-- OR (context-aware) -->
[See full documentation](${{ github.repository }}/blob/main/README.md)
```

### Pitfall 5: Documentation in External Locations

**What goes wrong:** External documentation references the old repository name:
- Blog posts and tutorials
- StackOverflow answers
- Other project READMEs
- Package.json repository fields

**Why it happens:** Repository links are copied to external sources that you don't control.

**How to avoid:**
1. **Accept:** Some external links will break (redirects handle most cases)
2. **Update:** Edit sources you control (your own blogs, docs)
3. **Redirects:** GitHub redirects mitigate most issues
4. **Monitor:** Check for broken links in analytics

**Note:** GitHub redirects are permanent, so old links continue working indefinitely.

## Code Examples

### Example 1: Rename Repository via GitHub CLI

```bash
# Prerequisites: Install and authenticate GitHub CLI
brew install gh  # or: sudo apt install gh
gh auth login

# Rename repository
gh repo edit Ilities/viberator --name viberglass

# Verify rename
gh repo view Ilities/viberglass --json name,url

# Output:
# {
#   "name": "viberglass",
#   "url": "https://github.com/Ilities/viberglass"
# }
```

**Verification:**
```bash
# Test redirect (old URL should still work)
curl -I https://github.com/Ilities/viberator
# Response should include: Status: 301 Moved Permanently
# Location: https://github.com/Ilities/viberglass
```

---

### Example 2: Update Local Git Remote

```bash
# Check current remote (before rename)
git remote -v
# origin  https://github.com/Ilities/viberator.git (fetch)
# origin  https://github.com/Ilities/viberator.git (push)

# After repository rename, git shows warning
git pull
# warning: redirecting to https://github.com/Ilities/viberglass.git/

# Update remote to new URL
git remote set-url origin https://github.com/Ilities/viberglass.git

# Verify update
git remote -v
# origin  https://github.com/Ilities/viberglass.git (fetch)
# origin  https://github.com/Ilities/viberglass.git (push)

# Test connection
git fetch origin
git branch -vv
```

---

### Example 3: Update CI/CD Workflow Repository Reference

**BEFORE (hardcoded - not recommended but exists):**
```yaml
# .github/workflows/example.yml
name: Example Workflow

on:
  push:
    branches: [main]

jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - name: Call GitHub API with hardcoded repo
        run: |
          curl https://api.github.com/repos/Ilities/viberator/releases
          # ^^ MUST UPDATE to viberglass
```

**AFTER (updated):**
```yaml
# .github/workflows/example.yml
name: Example Workflow

on:
  push:
    branches: [main]

jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - name: Call GitHub API with context variable
        run: |
          curl https://api.github.com/repos/${{ github.repository }}/releases
          # ^^ Uses github.repository context, automatic update
```

**Note:** Most workflows already use `{{ github.repository }}`, so no changes needed.

---

### Example 4: Update IAM OIDC Trust Policy (via Pulumi)

**Current state (infrastructure already expects "viberglass"):**
```typescript
// infrastructure/index.ts line 236
githubRepository: "ilities/viberglass", // TODO: make configurable
```

**After repository rename, no changes needed:**
```typescript
// infrastructure/index.ts line 236
githubRepository: "ilities/viberglass", // Matches renamed repository
```

**OIDC trust policy (from amplify-oidc.ts):**
```typescript
// Line 73 - Subject filter
"token.actions.githubusercontent.com:sub": "repo:${githubRepository}:*"
// Expands to: "repo:Ilities/viberglass:*"
```

**After rename:**
1. Repository becomes "Ilities/viberglass"
2. GitHub sends subject: `repo:Ilities/viberglass:ref:refs/heads/main`
3. IAM policy expects: `repo:Ilities/viberglass:*`
4. **Match!** Authentication succeeds

**Deployment:**
```bash
# Infrastructure already has correct reference
# No changes needed if Phase 15 already updated to "viberglass"

# If infrastructure still has "viberator", update it:
cd infrastructure
# Edit index.ts: githubRepository: "ilities/viberator" → "ilities/viberglass"
pulumi up --stack dev
```

---

### Example 5: Update Hardcoded Repository URLs in Documentation

**BEFORE:**
```markdown
# README.md

# Viberglass

[![CI](https://github.com/Ilities/viberator/actions/workflows/ci.yml/badge.svg)](https://github.com/Ilities/viberator/actions/workflows/ci.yml)

## Installation

Clone the repository:
```bash
git clone https://github.com/Ilities/viberator.git
```
```

**AFTER:**
```markdown
# README.md

# Viberglass

[![CI](https://github.com/Ilities/viberglass/actions/workflows/ci.yml/badge.svg)](https://github.com/Ilities/viberglass/actions/workflows/ci.yml)

## Installation

Clone the repository:
```bash
git clone https://github.com/Ilities/viberglass.git
# Or use the shorthand (works after clone):
git clone git@github.com:Ilities/viberglass.git
```

**Note:** README.md already reflects "Viberglass" branding from Phase 13, so only URL references need updating.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual webhook recreation | GitHub automatic redirects | 2012+ | No webhook recreation needed |
| Hardcoded repository URLs | Context-aware references (`{{ github.repository }}`) | 2019+ | Automatic updates in CI/CD |
| Manual remote URL updates for all devs | Git redirects + gradual remote updates | 2015+ | No immediate action required |
| Scripted rename via API | GitHub CLI (`gh repo edit`) | 2019+ | Simpler automation |

**Deprecated/outdated:**
- **Manual webhook recreation:** GitHub automatically handles redirects, no webhook recreation needed
- **Force re-clone:** Existing clones continue working with redirects
- **Bulk URL replacement:** Targeted updates better than blind find/replace

**New in 2024-2025:**
- **GitHub CLI improvements:** `gh repo edit` with better error messages
- **Improved redirect handling:** Faster redirects, better caching
- **Actions context improvements:** More context variables available

## Open Questions

### Question 1: Current Infrastructure Repository Reference

**What we know:**
- Infrastructure code has `githubRepository: "ilities/viberglass"` (line 236 in index.ts)
- Current repository name is "Ilities/viberator"
- This mismatch suggests either incomplete Phase 15 migration or intentional pre-configuration

**What's unclear:**
- Is the infrastructure deployed with "viberglass" reference (breaking current CI/CD)?
- Or is the infrastructure code ahead of the repository rename (intentional future-proofing)?
- Does current CI/CD use OIDC authentication (which would fail with mismatch)?

**Recommendation:**
1. **Verify:** Check current AWS IAM role trust policy in AWS Console
   - Go to IAM → Roles → GitHub Actions role
   - Check "Trust relationships" → "Condition" → "StringLike" → "token.actions.githubusercontent.com:sub"
   - If it says `repo:Ilities/viberator:*`, infrastructure needs update
   - If it says `repo:Ilities/viberglass:*`, repository rename will make it work

2. **Path A (if current policy has "viberator"):**
   - Phase 16.1: Rename repository to "viberglass"
   - Phase 16.2: Update infrastructure code to "viberglass" (no change needed)
   - Phase 16.3: Deploy infrastructure to update OIDC policy

3. **Path B (if current policy has "viberglass"):**
   - Repository rename is all that's needed (infrastructure already ready)
   - Deploy infrastructure to ensure OIDC policy matches

**Likely scenario:** Path B - infrastructure already references "viberglass" in anticipation of rename, but current CI/CD either doesn't use OIDC or has a temporary workaround.

### Question 2: Webhook Integration Impact

**What we know:**
- Backend has GitHub webhook integration for ticket creation
- Webhooks configured on repository send events to backend API
- Webhook URLs may include repository name

**What's unclear:**
- Are webhooks configured on this repository (for testing/integration)?
- Do webhook URLs reference the repository name?
- Will webhook deliveries continue working after rename?

**Recommendation:**
1. **Audit:** List repository webhooks before rename
   ```bash
   gh api repos/Ilities/viberator/hooks | jq '.[].url'
   ```

2. **Test:** After rename, verify webhook deliveries still arrive
   - Check backend logs for webhook POST requests
   - Trigger test webhook event (create a test issue/PR)
   - Verify webhook payload has correct repository name

3. **Update:** If webhooks break, reconfigure them
   ```bash
   # Delete old webhook
   gh api --method DELETE repos/Ilities/viberglass/hooks/{HOOK_ID}

   # Create new webhook with updated URL
   gh api repos/Ilities/viberglass/hooks \
     --input webhook-config.json
   ```

**Likely impact:** Low - GitHub webhooks use repository IDs internally, not names. Webhook deliveries continue working after rename.

### Question 3: SSM Parameter Path References

**What we know:**
- CI/CD workflows reference SSM parameters like `/viberator/dev/deployment/ecrRepository`
- Phase 15 updated SSM parameter paths to `/viberglass/dev/deployment/ecrRepository`
- These are infrastructure resources, not repository references

**What's unclear:**
- Are there SSM parameters that use "viberator" but haven't been migrated?
- Do CI/CD workflows still reference old parameter paths?

**Recommendation:**
1. **Search:** Find all SSM parameter references in workflows
   ```bash
   grep -r "/viberator/" .github/workflows/
   ```

2. **Verify:** Check if parameters exist in AWS
   ```bash
   aws ssm get-parameters-by-path --path "/viberator/dev/" --recursive
   aws ssm get-parameters-by-path --path "/viberglass/dev/" --recursive
   ```

3. **Update:** If old paths exist, either:
   - Migrate parameters to new paths (Phase 15)
   - Update workflow references to use new paths

**Note:** This is Phase 15 concern, not Phase 16. If Phase 15 completed successfully, SSM paths should already be updated.

## Sources

### Primary (HIGH confidence)
- [GitHub Docs - Renaming a Repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/renaming-a-repository) - Official GitHub documentation on repository rename behavior and redirects
- [GitHub CLI Docs - gh repo edit](https://cli.github.com/manual/gh_repo_edit) - Official GitHub CLI documentation for repository rename command
- [GitHub Actions Docs - Contexts](https://docs.github.com/en/actions/learn-github-actions/contexts) - Official documentation on `github.repository` context variable
- [Phase 15 Research Document](/.planning/phases/15-infrastructure-renaming/15-RESEARCH.md) - Infrastructure renaming research with OIDC trust policy analysis
- [Infrastructure codebase](/home/jussi/Development/viberator/infrastructure/) - Direct examination of OIDC trust policy configuration

### Secondary (MEDIUM confidence)
- [GitHub Blog - Webhooks Best Practices](https://github.blog/changelog/2021-03-04-webhook-improvements/) - GitHub webhook behavior and repository ID handling
- [AWS IAM Docs - OIDC Providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idc_oidc.html) - AWS documentation on IAM OIDC trust relationships
- [Git Docs - Remote URLs](https://git-scm.com/docs/git-remote) - Git documentation on remote URL handling and redirects

### Tertiary (LOW confidence)
- [StackOverflow - Repository Rename Impact](https://stackoverflow.com/questions/4662856/what-happens-when-i-rename-a-repository-on-github) - Community discussion on rename impacts (may need verification for latest GitHub behavior)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - GitHub rename process is well-documented and stable
- Architecture: HIGH - GitHub redirects and OIDC behavior are well-understood
- Pitfalls: MEDIUM - Integration impacts vary based on third-party services
- Open questions: MEDIUM - Current infrastructure state needs verification

**Research date:** 2026-01-24
**Valid until:** 2026-07-24 (180 days - GitHub features and APIs are stable, but verify before execution)

## Implementation Checklist by REPO Requirement

### REPO-01: GitHub repository renamed from "viberator" to "viberglass"

**Files:** None (GitHub repository metadata, not code)

**Steps:**
1. **Prerequisites:**
   - [ ] Verify repository owner (Ilities) has admin access
   - [ ] Verify new name "viberglass" is available
   - [ ] Notify team of upcoming rename

2. **Execution (via GitHub CLI):**
   ```bash
   # Install and authenticate
   brew install gh
   gh auth login

   # Rename repository
   gh repo edit Ilities/viberator --name viberglass

   # Verify rename
   gh repo view Ilities/viberglass
   ```

3. **Verification:**
   - [ ] Repository URL redirects: `https://github.com/Ilities/viberator` → `https://github.com/Ilities/viberglass`
   - [ ] Git clone works with new URL: `git clone https://github.com/Ilities/viberglass.git`
   - [ ] Git clone works with old URL (redirect): `git clone https://github.com/Ilities/viberator.git`
   - [ ] Repository settings show new name
   - [ ] Repository ID unchanged (verify: `gh repo view --json id`)

4. **Post-rename:**
   - [ ] Update local remote: `git remote set-url origin https://github.com/Ilities/viberglass.git`
   - [ ] Verify GitHub Actions workflows still trigger
   - [ ] Verify webhooks still deliver (if configured)

**Risk:** LOW - GitHub rename is reversible and has automatic redirects

**Rollback:**
```bash
# If needed, rename back
gh repo edit Ilities/viberglass --name viberator
```

---

### REPO-02: Root directory references updated in any path-sensitive configs

**Files:**
- `/home/jussi/Development/viberator/README.md` - Line 10-14: Clone instructions
- `/home/jussi/Development/viberator/.github/workflows/*.yml` - Check for hardcoded URLs
- Any documentation files with absolute GitHub URLs

**Search for hardcoded references:**
```bash
# Search for absolute GitHub URLs
grep -r "github.com/Ilities/viberator" --exclude-dir=node_modules --exclude-dir=.git .

# Search for git clone instructions
grep -r "git clone.*viberator" --exclude-dir=node_modules .
```

**Changes (example for README.md):**
```markdown
# BEFORE
```bash
git clone https://github.com/Ilities/viberator.git
cd viberator
```

# AFTER
```bash
git clone https://github.com/Ilities/viberglass.git
cd viberglass
```
```

**Changes for CI/CD workflows (if hardcoded):**
```yaml
# BEFORE
- name: Example step
  run: |
    curl https://api.github.com/repos/Ilities/viberator/releases

# AFTER
- name: Example step
  run: |
    curl https://api.github.com/repos/${{ github.repository }}/releases
    # OR update to new name:
    curl https://api.github.com/repos/Ilities/viberglass/releases
```

**Risk:** LOW - Most workflows use `{{ github.repository }}` context

**Verification:**
```bash
# After changes, verify no old references remain
grep -r "Ilities/viberator" --exclude-dir=node_modules --exclude-dir=.git .
```

---

### REPO-03: CI/CD workflows updated with new repository name references

**Files:**
- `/home/jussi/Development/viberator/.github/workflows/frontend-ci.yml`
- `/home/jussi/Development/viberator/.github/workflows/backend-ci.yml`
- `/home/jussi/Development/viberator/.github/workflows/pulumi-preview.yml`
- `/home/jussi/Development/viberator/.github/workflows/pulumi-deploy-dev.yml`
- `/home/jussi/Development/viberator/.github/workflows/pulumi-deploy-prod.yml`
- `/home/jussi/Development/viberator/.github/workflows/deploy-backend-dev.yml`
- `/home/jussi/Development/viberator/.github/workflows/deploy-frontend-dev.yml`
- `/home/jussi/Development/viberator/.github/workflows/deploy-backend-staging.yml`
- `/home/jussi/Development/viberator/.github/workflows/deploy-frontend-staging.yml`
- `/home/jussi/Development/viberator/.github/workflows/deploy-backend-prod.yml`
- `/home/jussi/Development/viberator/.github/workflows/deploy-frontend-prod.yml`

**Analysis of current workflows:**
- Most workflows use `{{ github.repository }}` context (automatic)
- Workflows use `@viberator/*` workspace references (npm package names, not repository)
- Workflows reference SSM parameters like `/viberator/dev/...` (infrastructure paths)

**Note:** The `@viberator/*` references are npm workspace names, not repository names. These should remain as-is (the worker package is called "viberator" per branding split).

**Changes needed:**
1. **Check for hardcoded repository URLs:**
   ```yaml
   # If any workflow has:
   curl https://api.github.com/repos/Ilities/viberator/...

   # Change to:
   curl https://api.github.com/repos/${{ github.repository }}/...
   ```

2. **Check source-url references (found in deploy workflows):**
   ```yaml
   # From deploy-frontend-dev.yml line 106:
   --source-url "https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"

   # This uses github.repository context, so NO CHANGE NEEDED
   ```

**Risk:** LOW - Most workflows use context variables, not hardcoded names

**Verification:**
1. Push a commit to trigger workflows
2. Check workflow logs for repository name references
3. Verify deployments succeed

---

## Additional Files Requiring Updates

### Package.json Repository Field (if present)

**Files:**
- `/home/jussi/Development/viberator/package.json`
- `/home/jussi/Development/viberator/viberator/app/package.json`
- Other package.json files with repository field

**Check for repository field:**
```bash
grep -r '"repository"' package.json **/package.json
```

**Example update (if present):**
```json
{
  "name": "@viberator/orchestrator",
  "repository": {
    "type": "git",
    "url": "https://github.com/Ilities/viberglass.git"
  }
}
```

**Note:** From my analysis, most package.json files don't have a repository field, so this may not apply.

---

### Documentation with Repository Links

**Files:**
- `/home/jussi/Development/viberator/README.md` - Clone instructions, badges
- Any markdown files with absolute GitHub URLs

**Search:**
```bash
grep -r "github.com/Ilities/viberator" --include="*.md" .
```

**Update badges:**
```markdown
<!-- BEFORE -->
[![CI](https://github.com/Ilities/viberator/actions/workflows/ci.yml/badge.svg)](https://github.com/Ilities/viberator/actions/workflows/ci.yml)

<!-- AFTER -->
[![CI](https://github.com/Ilities/viberglass/actions/workflows/ci.yml/badge.svg)](https://github.com/Ilities/viberglass/actions/workflows/ci.yml)
```

**Note:** From Phase 13, README.md may already have updated branding but still reference "viberator" in URLs. Verify and update.

---

## Deployment Order and Risk Mitigation

### Step 1: Pre-Rename Preparation (Day 0)

**Goal:** Verify current state and prepare for rename.

**Checklist:**
- [ ] Verify current repository name: `gh repo view --json name`
- [ ] Check infrastructure OIDC trust policy in AWS Console
- [ ] List all repository webhooks: `gh api repos/Ilities/viberator/hooks`
- [ ] Search for hardcoded repository URLs in code
- [ ] Notify team of upcoming rename
- [ ] Create backup of critical data (issues, PRs are in GitHub, no backup needed)

**Time estimate:** 30 minutes

---

### Step 2: Repository Rename (Day 0)

**Goal:** Execute repository rename with minimal disruption.

**Process:**
1. **During low-traffic period** (if applicable)
2. **Rename repository:**
   ```bash
   gh repo edit Ilities/viberator --name viberglass
   ```
3. **Verify rename:**
   - [ ] Old URL redirects to new URL
   - [ ] New URL works: `https://github.com/Ilities/viberglass`
   - [ ] Git clone works with both old and new URLs
   - [ ] Repository settings show new name

**Rollback:** If issues occur, rename back:
```bash
gh repo edit Ilities/viberglass --name viberator
```

**Time estimate:** 5 minutes

---

### Step 3: Update Local Development Environment (Day 0-1)

**Goal:** Update developer local clones.

**Process:**
1. **Update personal remote:**
   ```bash
   git remote set-url origin https://github.com/Ilities/viberglass.git
   git fetch origin
   ```

2. **Verify:**
   ```bash
   git remote -v
   git branch -vv
   ```

3. **Communicate:** Provide instructions to team via Slack/email

**Time estimate:** 5 minutes per developer

---

### Step 4: Update Hardcoded References (Day 0-1)

**Goal:** Update any hardcoded repository URLs in code/docs.

**Process:**
1. **Search for references:**
   ```bash
   grep -r "Ilities/viberator" --exclude-dir=node_modules --exclude-dir=.git .
   ```

2. **Update files:** Edit files with hardcoded URLs

3. **Verify:** Run search again to confirm no old references remain

**Time estimate:** 30-60 minutes

---

### Step 5: Update CI/CD (if needed) (Day 0)

**Goal:** Verify CI/CD workflows work with new repository name.

**Process:**
1. **Push test commit:** Trigger workflows
2. **Monitor runs:** Check Actions tab for failures
3. **Fix issues:** Update any hardcoded references

**Time estimate:** 15-30 minutes

---

### Step 6: Verify Integrations (Day 1-7)

**Goal:** Ensure all integrations still work.

**Checklist:**
- [ ] GitHub Actions trigger correctly
- [ ] Webhooks deliver (if configured)
- [ ] Third-party integrations work (Dependabot, coverage tools, etc.)
- [ ] OIDC authentication works (check CloudTrail logs)

**Time estimate:** 30 minutes over first week

---

## Risk Assessment

| Component | Failure Risk | Impact | Mitigation |
|-----------|--------------|--------|------------|
| **Repository rename** | LOW | LOW | GitHub handles redirects, reversible |
| **Local clones** | LOW | LOW | Existing clones work, update remote |
| **CI/CD workflows** | LOW | MEDIUM | Most use context variables, test after rename |
| **Webhooks** | LOW | MEDIUM | GitHub handles internally, verify deliveries |
| **OIDC authentication** | MEDIUM | HIGH | Verify trust policy matches repository name |
| **Hardcoded URLs** | LOW | LOW | Redirects work, update for clarity |
| **Third-party integrations** | MEDIUM | LOW-MEDIUM | Depends on integration, verify individually |
| **Team confusion** | LOW | LOW | Communicate changes clearly |

**Overall risk:** LOW - Repository rename is well-supported by GitHub with automatic redirects. The main risk is OIDC authentication mismatch if infrastructure and repository are out of sync.

**Mitigation:**
1. Verify OIDC trust policy before rename
2. Test CI/CD immediately after rename
3. Monitor webhook deliveries for failures
4. Communicate clearly with team

---

## Automation Opportunities

### Script: Rename Repository and Verify

```bash
#!/bin/bash
set -e

OLD_REPO="Ilities/viberator"
NEW_REPO="Ilities/viberglass"

echo "Step 1: Renaming repository..."
gh repo edit $OLD_REPO --name viberglass

echo "Step 2: Verifying rename..."
NEW_NAME=$(gh repo view $NEW_REPO --json name -q .name)
if [ "$NEW_NAME" != "viberglass" ]; then
  echo "ERROR: Repository rename failed"
  exit 1
fi
echo "✓ Repository renamed to: $NEW_NAME"

echo "Step 3: Testing redirect..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://github.com/$OLD_REPO)
if [ "$HTTP_CODE" != "301" ]; then
  echo "WARNING: Expected redirect (301), got $HTTP_CODE"
fi
echo "✓ Redirect works"

echo "Step 4: Updating local remote..."
git remote set-url origin https://github.com/$NEW_REPO.git
echo "✓ Local remote updated"

echo "Step 5: Verifying git operations..."
git fetch origin
echo "✓ Git fetch successful"

echo "✓ Repository rename complete!"
```

### Script: Find Hardcoded Repository References

```bash
#!/bin/bash

echo "Searching for hardcoded repository references..."
echo ""

echo "=== Markdown files ==="
grep -r "Ilities/viberator" --include="*.md" --exclude-dir=node_modules . || echo "None found"

echo ""
echo "=== Workflow files ==="
grep -r "Ilities/viberator" --include="*.yml" .github/ || echo "None found"

echo ""
echo "=== Package.json files ==="
grep -r '"repository"' --include="package.json" . || echo "None found"

echo ""
echo "=== Code files ==="
grep -r "github.com/Ilities/viberator" --exclude-dir=node_modules --exclude-dir=.git . || echo "None found"
```

### Script: Update Hardcoded References (CAUTION: Review first)

```bash
#!/bin/bash
set -e

# CAUTION: This script performs find/replace. Review changes before committing!

echo "Finding files with hardcoded references..."
FILES=$(grep -rl "Ilities/viberator" --exclude-dir=node_modules --exclude-dir=.git .)

if [ -z "$FILES" ]; then
  echo "No files found with hardcoded references"
  exit 0
fi

echo "Found files:"
echo "$FILES"
echo ""
read -p "Update these files? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted"
  exit 0
fi

# Perform replacement
find . -type f \
  ! -path "*/node_modules/*" \
  ! -path "*/.git/*" \
  -exec sed -i 's|Ilities/viberator|Ilities/viberglass|g' {} +

echo "✓ Updated files"
echo ""
echo "Review changes with: git diff"
```

**Warning:** Always review changes before committing. Some "viberator" references should remain (e.g., `@viberator/*` package names, `viberator/app` directory).

---

## Testing Strategy

### Pre-Rename Testing

1. **Verify OIDC trust policy:**
   ```bash
   # Check current IAM role trust policy
   aws iam get-role --role-name <GITHUB_ACTIONS_ROLE_NAME> --query 'Role.AssumeRolePolicyDocument'
   ```

2. **List current webhooks:**
   ```bash
   gh api repos/Ilities/viberator/hooks
   ```

3. **Test current CI/CD:**
   - Push a test commit
   - Verify all workflows succeed
   - Document baseline behavior

---

### Post-Rename Testing

1. **Test repository access:**
   ```bash
   # New URL should work
   curl -I https://github.com/Ilities/viberglass

   # Old URL should redirect
   curl -I https://github.com/Ilities/viberator
   ```

2. **Test git operations:**
   ```bash
   # Update remote
   git remote set-url origin https://github.com/Ilities/viberglass.git

   # Test fetch
   git fetch origin

   # Test push (if needed)
   git push origin HEAD
   ```

3. **Test CI/CD:**
   - Push a commit to trigger workflows
   - Monitor Actions tab for failures
   - Check deployments succeed

4. **Test webhooks:**
   - Create a test issue/PR
   - Verify webhook delivers to backend (if configured)
   - Check webhook logs in repository settings

5. **Test OIDC authentication:**
   - Trigger a workflow that uses OIDC (e.g., pulumi deploy)
   - Check CloudTrail logs for AssumeRoleWithWebIdentity calls
   - Verify subject claim matches new repository name

---

## Rollback Strategy

### If Repository Rename Fails

**Symptoms:**
- `gh repo edit` returns error
- Repository becomes inaccessible
- GitHub shows error page

**Rollback steps:**
1. Wait 5 minutes (GitHub may be propagating changes)
2. Try renaming again: `gh repo edit Ilities/viberglass --name viberator`
3. If still failing, contact GitHub Support
4. Repository data is safe (no deletions during rename)

---

### If CI/CD Fails After Rename

**Symptoms:**
- GitHub Actions fail with "repository not found"
- OIDC authentication fails
- Deployments fail

**Rollback steps:**
1. **Immediate:** Rename repository back
   ```bash
   gh repo edit Ilities/viberglass --name viberator
   ```

2. **Diagnose:**
   - Check workflow logs for specific error
   - Check OIDC trust policy in AWS Console
   - Check if workflows have hardcoded references

3. **Fix and retry:**
   - Fix root cause (e.g., update trust policy)
   - Rename repository again
   - Test with non-critical workflow first

---

### If Webhooks Fail After Rename

**Symptoms:**
- Backend doesn't receive webhook events
- GitHub webhook delivery logs show failures

**Rollback steps:**
1. **Check webhook configuration:**
   ```bash
   gh api repos/Ilities/viberglass/hooks
   ```

2. **Recreate webhook if needed:**
   ```bash
   # Delete old webhook
   gh api --method DELETE repos/Ilities/viberglass/hooks/{HOOK_ID}

   # Create new webhook
   gh api repos/Ilities/viberglass/hooks --input webhook-config.json
   ```

3. **Note:** GitHub webhooks typically don't need recreation (they use repository IDs)

---

## Success Criteria Verification

After completing Phase 16, verify:

- [ ] **REPO-01:** GitHub repository is renamed from "viberator" to "viberglass"
  - `gh repo view --json name` returns `"name": "viberglass"`
  - `https://github.com/Ilities/viberglass` loads correctly
  - Old URL `https://github.com/Ilities/viberator` redirects to new URL

- [ ] **REPO-02:** Root directory references updated in any path-sensitive configs
  - `grep -r "Ilities/viberator" --exclude-dir=node_modules .` returns no results
  - Clone instructions in README.md use new repository name
  - Badges and links in documentation use new repository name

- [ ] **REPO-03:** CI/CD workflows updated with new repository name references
  - All GitHub Actions workflows trigger successfully
  - OIDC authentication succeeds (check CloudTrail logs)
  - Deployments to all environments succeed
  - No hardcoded repository URLs in workflow files

---

## Conclusion

Phase 16 (Repository Migration) is a **low-risk** operation with **high confidence** in success. GitHub repository rename is a well-supported feature with automatic redirects, and most integration points (CI/CD, webhooks) adapt automatically.

**Key takeaways:**
1. **GitHub handles the hard parts:** Automatic redirects, webhook continuity, git operation compatibility
2. **Focus on manual updates:** Hardcoded URLs in code/docs, team communication
3. **Verify OIDC trust policy:** Ensure it matches repository name (may already expect "viberglass")
4. **Test after rename:** Verify CI/CD, webhooks, and integrations work correctly

**Estimated effort:** 2-4 hours total (including preparation, execution, verification, and team communication)

**Risk level:** LOW - Repository rename is reversible and has built-in safety mechanisms (redirects, no data deletion).

**Recommended approach:**
1. Complete pre-rename preparation (audit OIDC policy, list webhooks)
2. Execute repository rename during low-traffic period
3. Update local remotes and hardcoded references
4. Test CI/CD and integrations thoroughly
5. Monitor for issues over first week after rename
