# Eval plan: grading agent runs

Status as of 2026-09-30 · Owner of decisions: Jussi

Viberglass runs coding agents on real tasks. The eval work answers one question with evidence, not impressions: **which agent, model and prompt setup produces work that people accept, at what cost?** It uses the runs people already make as the corpus, so there's no separate benchmark to maintain.

Read it with:
- [`packages/telemetry/README.md`](../packages/telemetry/README.md): tracing, the run manifest, PR outcome labels and the export.
- [`telemetry-local.md`](./telemetry-local.md): running Langfuse or another OTLP backend locally.
- `packages/evals`: the graders and the report CLI.

---

## 1. Rules the corpus keeps

These are already built in. Anything added must keep them.

1. **Absent is not zero.** A value the platform didn't record is null, never a default. Token usage the CLI didn't report is `usage_available = false`. A cost from a plugin constant is `cost_provenance = 'estimated'`, never `'actual'`.
2. **Ungradable is not failed.** A grader returns null when a run can't be judged yet (no PR, PR still open). Null is never counted as a failure.
3. **Grades are versioned.** Every grader has a `version`, bumped whenever its rule changes. Grades made under different versions are never averaged together.
4. **The sampling unit is the task.** A task's research, plan, build and retries are correlated, so comparisons and confidence intervals are computed per task, not per run.
5. **Conventions are pinned.** GenAI attribute names are pinned to `@opentelemetry/semantic-conventions@1.43.0`, and a test fails if a bump renames them.
6. **No content by default.** Prompts and completions are only exported with `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=true`. Manifests carry a prompt hash and length instead.

## 2. Where things stand

| Stage | What | Status |
|---|---|---|
| 0. Record | One trace per job across backend and worker; a run manifest per job (migration 064); PR outcome labels from GitHub (`PullRequestOutcomeSweeper`, migration 069); admin NDJSON export (`GET /api/run-manifests/export`); Settings → Run records | **Done** (73d4614, 646d0f8) |
| 1. Outcome graders | `run_succeeded`, `pull_request_merged`, `review_comments`; a report per agent with cost per merged PR (`npm run report -w @viberglass/evals -- export.ndjson`) | **Started**: 3 graders, 20 unit tests. See §3 |
| 2. Document review graders | Grades for research and plan runs from how people reviewed the document | Not started |
| 3. Trajectory graders | Grades from what the agent did (the job's logs) | Not started |
| 4. Comparison runs | Re-running a fixed task set with different agents or models | Not started |
| 5. In the product | Outcome views and agent comparison for product leaders (plan §12, Phase 5) | Not started |

**Known gaps in the recording** (from the telemetry README):
- Live-session turns run through `AcpExecutor` and get no `invoke_agent` span, so they record no model or usage.
- Only Claude Code and OpenCode report usage. OpenCode names no model, so its manifests carry no `model_snapshot`.
- Only GitHub PRs get outcome labels.
- A job re-dispatched from a stored payload joins its original trace.

## 3. Stage 1: finish the outcome graders

What remains before the Stage 1 report can be trusted:

1. **Run the packages in CI.** Neither `@viberglass/evals` nor `@viberglass/telemetry` runs in any workflow (`backend-ci.yml` only tests the backend). Add both, since the telemetry package holds the pinned-convention test.
2. **Store grades.** `job_run_manifests.grader_version` is one column per run, but a run gets a grade from every grader. Add a `run_grades` table: `(job_id, grader, grader_version, value, reason, graded_at)`, unique on the first three. Leave the manifest immutable and drop its unused `grader_version` column in the same migration. Then grading can be re-run whenever a PR is decided, and old versions stay comparable with themselves.
3. **Grade on a schedule.** Run the graders after each outcome sweep, for runs whose PR changed state. That reuses `PullRequestOutcomeSweeper`'s cadence rather than adding a new sweeper.
4. **Report per task, with uncertainty.** Group results by agent *and* by task, and give a bootstrap interval resampled by task (rule 4). With tens of tasks per agent, an interval stops a 3-point difference being read as a win.
5. **Say what each grader covers.** Research and planning runs open no PR, so `pull_request_merged` and `review_comments` are ungradable for them. Report each grader's coverage (graded / ungradable) next to its mean. The report already counts `ungradable`.

**Acceptance:** the report for the last 30 days runs in CI against a fixture export, and against a live export, and shows per-agent merge rate with an interval, and cost per merged PR where cost is measured.

## 4. Stage 2: document review graders (research and plan runs)

Most runs are research and planning, and they end in a document a person reviews, not a PR. The review is already recorded:
- `ticket_phase_approvals` and `ticket_phase_documents`: whether and when the document was approved, and by whom;
- `ticket_phase_document_revisions`: how many revisions it took, and whether each was the agent's or a hand edit (`source`);
- `ticket_phase_document_comments`: line comments and suggestions, and whether they were resolved.

Graders, all deterministic:
- `document_approved`: approved (1), superseded by a newer run or the task closed without approval (0), still in review (null).
- `revision_rounds`: agent revisions requested before approval.
- `hand_edited`: a person edited the document before approving it, a sign the agent's version wasn't good enough.
- `open_comments_at_approval`: comments still open when approved.

These need the export to join a run to its document outcome. `ticket_phase_runs` links a run to its task and step, and revisions record whether an agent or a person wrote them (`source`), but a revision doesn't record which run wrote it. Add `job_id` to agent revisions first. Matching by time would mislabel runs that overlap.

## 5. Stage 3: trajectory graders

From the job's normalized log lines (in the export with `includeLogs=true`), deterministic first:
- The build ran the repository's tests before finishing, and they passed.
- Files read before the first edit (did it look before it changed things).
- Time and cost to the first useful output.
- Tool errors and permission denials.

Only after these, a model-graded rubric for research and plan quality. It must be calibrated against Stage 2's human outcomes (does the judge's score predict approval without revision?), and it's versioned like any grader. It needs content capture, so it only runs where an admin has turned that on (rule 6).

## 6. Stage 4: comparison runs

Outcome data compares agents only on the tasks each happened to get. A fair comparison re-runs the same tasks:
- **Task set:** tasks with a merged PR and a recorded `base_sha`, so the starting point is reproducible.
- **Replay:** dispatch the same task, prompt and `base_sha` with a different agent or model, in a comparison space so no PRs are opened against real repositories.
- **Grading:** Stage 3 graders plus a diff comparison with the merged PR. Merge outcomes don't exist for replays.
- **Regression use:** the fake agent (`agent-fake`) and the fake provider already give a deterministic harness. A small replay set in CI catches prompt or harness changes that break runs, before any model is involved.

## 7. Decisions waiting on Jussi

| # | Decision | Needed before | Recommendation |
|---|---|---|---|
| E1 | Where grades live: a `run_grades` table, or files next to exports | Stage 1 step 2 | The table. The product surfaces in Stage 5 need them queryable, and grading on a schedule needs somewhere to write. |
| E2 | Where traces go in production: Langfuse, another OTLP backend, or none | Before relying on traces for Stage 3 | Decide after measuring trace volume on the pilot, as the telemetry README says. Stages 1 and 2 need only the database and the export, not traces. |
| E3 | Content capture for evals | Stage 3's model-graded rubric, Stage 4 | Off by default, on per instance by an admin, with the prompt text stored with the manifest rather than only in traces. Replays need the exact prompt. |
| E4 | Where comparison runs execute | Stage 4 | A dedicated comparison space with PR creation turned off, on the same runners, with its own cost budget. |
