# 00 · Clean-machine install

Can a stranger get from the README to a merged pull request without help? Every test here starts from a machine or account that has never run Viberglass, uses only the public docs, and is timed. The rest of the suite tests the product; this file tests the first hour of someone who found it on Hacker News.

## Contents

- [Rules](#rules)
- [Known issues](#known-issues)
- [Local Docker (CLEAN-01 – CLEAN-06)](#local-docker-clean-01--clean-06)
- [First pull requests on real repositories (CLEAN-10 – CLEAN-14)](#first-pull-requests-on-real-repositories-clean-10--clean-14)
- [Kubernetes (CLEAN-20 – CLEAN-23)](#kubernetes-clean-20--clean-23)
- [AWS (CLEAN-30 – CLEAN-32)](#aws-clean-30--clean-32)
- [Someone else, cold (CLEAN-40 – CLEAN-41)](#someone-else-cold-clean-40--clean-41)
- [Results](#results)

## Rules

- A clean machine. A fresh VM or cloud instance, or a new user account with no Docker images, volumes, `~/.npmrc`, `.env` or cloned repository. For the cloud paths, an account and cluster that have never had Viberglass on them.
- Only public docs. Follow the README and the pages it links, at the commit being released. No `.agents/`, handovers, shell history or memory. If you need something the docs don't say, that's a failure even if you know the answer: write down what you needed and where you looked.
- Time it. Start a timer at `git clone` (or the first cloud command) and record the elapsed time at each Expect. Note download and build waits separately from time spent reading or fixing.
- Write down every hesitation, not only errors: unclear copy, a step you had to read twice, a choice you couldn't make, a page you landed on that didn't help.
- Disposable credentials. A new GitHub test repository and fine-grained token, and a model key from the free or coding-plan tiers. Revoke them afterwards.

Targets for launch: local install to the first task's plan in under 15 minutes on a typical laptop and connection, excluding image downloads; plan to an open PR with no doc lookups.

## Known issues

Found while rewriting the README (2026-10-07). Record whether each still holds.

- Pull requests are GitHub-only. `GitService` calls `api.github.com`. The GitLab, Bitbucket, Linear and Monday integration packages are stubs. The README no longer claims GitLab.
- Password reset only logs the request; resets are admin-issued links.
- No visuals. The old diagram, infographic and screenshots were removed; a demo video or GIF and new screenshots are needed.
- License loose ends. `apps/platform-frontend/LICENSE.md` is an unfilled Apache 2.0 template. If it's there for vendored components (`components/ai-elements` comes from Vercel's Apache-licensed AI Elements), move it next to them with a notice saying what it covers. Otherwise remove it. The app has no link to its source; AGPL section 13 asks a modified version to offer one to its network users, so a "Source" link (e.g. in the user menu) makes that easy for people who fork it.
- `security@viberglass.io` is the reporting address in SECURITY.md. Send it a test mail before launch.

## Local Docker (CLEAN-01 – CLEAN-06)

Run on at least Linux and macOS (Apple silicon). Windows with WSL 2 if you want to claim it.

### CLEAN-01 · Clone and start
1. Follow the README's Quick start exactly: `git clone`, `cd`, `docker compose up`.
2. Note the time until http://localhost:3000 loads, and the download size if you can see it.

Expect: no errors in the compose output that look alarming to a newcomer; the page loads without a manual refresh. Record anything that needs a port to be free (5432, 8888, 3000) and whether the message says so.

### CLEAN-02 · First admin and setup
1. Create the administrator.
2. Model key: use a provider from the free or coding-plan tiers. Paste a wrong key first, then the right one.
3. Repository: the disposable repository. Use Create a token with the right permissions and accept GitHub's form as prefilled.
4. Space, default agent.

Expect: each step explains itself; the wrong key gets a plain-language error; the token from the prefilled form is accepted on the first try; the default agent shows Ready. Record how long the agent took to become ready (it pulls a worker image).

### CLEAN-03 · First task to plan
1. Write a small, real task for the repository (e.g. "Add a `--version` flag").
2. Ask for a plan.

Expect: the run starts within a minute; its activity is readable while it runs; a nonempty plan arrives. Record the time from creating the task to the plan.

### CLEAN-04 · Plan to pull request
1. Comment on one line of the plan and ask for a revision.
2. Build it.
3. Open the PR on GitHub.

Expect: the revision addresses the comment; the PR exists and its diff matches the plan; the task links to it. Record the branch name, and whether a reviewer on GitHub could find their way back to the task from the PR.

### CLEAN-05 · Merge closes the task
1. Merge the PR on GitHub.
2. Wait for the task to close (up to about an hour; the merge is picked up by a periodic check).

Expect: the task shows as done. Record how long it took, and whether anything told you to expect the wait.

### CLEAN-06 · Stop and start again
1. `docker compose down`, then `docker compose up`.
2. `git pull` to a newer commit if one exists, then `docker compose up --build`.

Expect: data survives; migrations run without prompts; the default agent still works.

## First pull requests on real repositories (CLEAN-10 – CLEAN-14)

The end-to-end path from a writable repository to a merged PR has never been run outside fixtures. Do it on repositories that look like what HN readers will try, each from a fresh space, with the default agent and with one other harness.

| ID | Repository | Task |
|---|---|---|
| CLEAN-10 | Small TypeScript/Node library | A bug fix with a failing test to add |
| CLEAN-11 | Python project with `pyproject.toml` | A small feature with a CLI flag |
| CLEAN-12 | Go or Rust service | A change across two packages or modules |
| CLEAN-13 | A monorepo of a few hundred files | A change in one package; check the agent doesn't wander |
| CLEAN-14 | Private repository in an organization | Anything; checks the token, SSO-enforced orgs and the PR's base branch |

For each, record: plan quality (would you approve it?), revisions needed, whether the build compiles and its tests pass, whether the PR opened, time and cost from the run's details.

Expect: at least four of five reach a mergeable PR, with no step that needs a workaround in Viberglass itself. Agent mistakes are fine to record; platform failures are blockers.

## Kubernetes (CLEAN-20 – CLEAN-23)

Follow only [local-kubernetes.md](../../local-kubernetes.md) and [kubernetes-deployment.md](../../kubernetes-deployment.md). The detailed checks are in [06-kubernetes.md](06-kubernetes.md); here, the question is whether the docs alone get a newcomer there.

### CLEAN-20 · kind from the README
1. Run `python3 infra/kubernetes/scripts/local.py` on a clean machine with only the stated prerequisites.

Expect: the app is reachable at the address the docs give; setup and a first plan work (CLEAN-02, CLEAN-03). Record the total time and disk used.

### CLEAN-21 · Managed cluster on OVHcloud
1. In a fresh OVHcloud project, follow the docs from nothing: cluster, registry, PostgreSQL, object storage, ingress, DNS and TLS, images, secrets, Helm install.
2. Record every resource you created and every value you had to guess.

Expect: HTTPS sign-in, setup, a plan and a PR (CLEAN-02 – CLEAN-04) on the cluster. Each guess is a doc fix. Once the OVHcloud provisioning stack exists, repeat with it and compare.

### CLEAN-22 · Monthly cost
1. From the provider's billing after a few days idle and a day of use, record the cost of the cluster, nodes, load balancer, database, storage and traffic.

Expect: a figure you can put in the docs ("a small team's installation costs about €N/month").

### CLEAN-23 · Teardown
1. Uninstall and delete everything CLEAN-21 created, following the docs.

Expect: nothing left billable a day later.

## AWS (CLEAN-30 – CLEAN-32)

Follow only the README's AWS section, [infra/README.md](../../../infra/README.md) and what they link. Details are in [05-aws.md](05-aws.md).

### CLEAN-30 · Deploy from nothing
1. A fresh AWS account (or one with no Viberglass stacks), a domain you control.
2. Pulumi state, base, platform, worker images, workers, as documented.

Expect: HTTPS sign-in and setup on ECS. Record the time, every guessed value, and the stack outputs you had to copy by hand.

### CLEAN-31 · Product on AWS
1. CLEAN-02 – CLEAN-05 with an ECS runner, then a Lambda runner.
2. Invite a member by email (SES).

Expect: as on Docker. Note the cold-start time of an ECS run.

### CLEAN-32 · Cost and teardown
1. Record the idle and in-use monthly cost.
2. Destroy the stacks as documented.

Expect: a cost figure for the docs; nothing billable left, including ECR images, S3 buckets, log groups, SSM parameters and Amplify apps.

## Someone else, cold (CLEAN-40 – CLEAN-41)

### CLEAN-40 · Install
Needs: one engineer who hasn't seen Viberglass, their own laptop, a screen share.
1. Give them the repository URL and nothing else. Don't answer questions; note them.

Expect: they reach a plan (CLEAN-03) on their own. Record where they stopped, what they tried, and the time.

### CLEAN-41 · Explain it back
1. After CLEAN-40, ask: what does this do, who in your company would use it, what would stop you?

Expect: their one-line description matches the README's first line. Their objections are the launch post's FAQ.

## Results

| ID | Date | Machine / account | Commit | Elapsed | Result | Notes |
|---|---|---|---|---|---|---|
| CLEAN-01 | | | | | | |
