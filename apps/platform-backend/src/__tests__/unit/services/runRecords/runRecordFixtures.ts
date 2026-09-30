import type { RunRecordRow } from "../../../../persistence/job/RunRecordDAO";

export function runRecordRow(overrides: Partial<RunRecordRow> = {}): RunRecordRow {
  const at = new Date("2026-09-30T10:00:00.000Z");
  return {
    job_id: "job-1", manifest_version: 1, tenant_id: "tenant-1", job_kind: "execution",
    ticket_id: "ticket-1", project_id: "project-1", clanker_id: null, requested_agent: "opencode",
    repository: "https://github.com/acme/app", base_branch: "main", worker_type: "docker",
    compute_image: null, config_hash: "cfg", instructions_hash: "ins", granted_credential_names: null,
    dispatched_at: at, agent: "opencode", harness_version: null, model_snapshot: null,
    base_sha: "abc", commit_sha: "def", branch: "fix/1",
    pull_request_url: "https://github.com/acme/app/pull/1", changed_file_count: 2,
    prompt_hash: "p", prompt_characters: 100, tool_permissions: null,
    usage: { inputTokens: 7748, outputTokens: 14, reasoningOutputTokens: 0 },
    usage_available: true, cost_usd: "0.001169", cost_provenance: "actual", stop_reason: "stop",
    success: true, error_message: null, started_at: at, finished_at: at, duration_ms: 1000,
    grader_version: null, created_at: at, updated_at: at,
    project_slug: "acme", ticket_title: "Fix it", clanker_name: "OpenCode Local", clanker_slug: "opencode-local",
    pr_state: "merged", pr_merged_at: at, pr_closed_at: at, pr_comment_count: 1,
    pr_review_comment_count: 2, pr_checked_at: at, pr_last_error: null,
    ...overrides,
  };
}
