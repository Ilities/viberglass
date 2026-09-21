/**
 * Viberglass-specific span attributes.
 *
 * Everything the GenAI conventions already name lives in `semconv.ts`. This
 * file is only for the domain concepts the spec has no attribute for — jobs,
 * tickets, clankers, tenants, worker type. All prefixed `vg.` so they are
 * obviously ours and cannot collide with a future semconv revision.
 */

export const ATTR_VG_TENANT_ID = "vg.tenant.id";
export const ATTR_VG_PROJECT_ID = "vg.project.id";
export const ATTR_VG_JOB_ID = "vg.job.id";
export const ATTR_VG_JOB_KIND = "vg.job.kind";
export const ATTR_VG_TICKET_ID = "vg.ticket.id";
export const ATTR_VG_CLANKER_ID = "vg.clanker.id";
export const ATTR_VG_WORKER_TYPE = "vg.worker.type";
export const ATTR_VG_WORKER_EXECUTION_ID = "vg.worker.execution_id";
export const ATTR_VG_WORKER_INVOKE_ATTEMPTS = "vg.worker.invoke_attempts";
export const ATTR_VG_AGENT_SESSION_ID = "vg.agent.session_id";
export const ATTR_VG_AGENT_TURN_ID = "vg.agent.turn_id";
export const ATTR_VG_SESSION_MODE = "vg.session.mode";

export const ATTR_VG_REPOSITORY = "vg.repository";
export const ATTR_VG_BASE_BRANCH = "vg.git.base_branch";
export const ATTR_VG_BRANCH = "vg.git.branch";
export const ATTR_VG_COMMIT_SHA = "vg.git.commit_sha";
export const ATTR_VG_BASE_SHA = "vg.git.base_sha";
export const ATTR_VG_CHANGED_FILE_COUNT = "vg.git.changed_file_count";
export const ATTR_VG_PULL_REQUEST_URL = "vg.pull_request.url";

export const ATTR_VG_AGENT_EXIT_CODE = "vg.agent.exit_code";
export const ATTR_VG_AGENT_HARNESS_VERSION = "vg.agent.harness_version";
export const ATTR_VG_AGENT_AUTH_RETRIED = "vg.agent.auth_retried";
export const ATTR_VG_STOP_REASON = "vg.stop_reason";

/**
 * Set when a CLI does not report token usage.
 *
 * PLAN.md is explicit that per-job cost is currently a hardcoded per-plugin
 * constant: "record 'unavailable' where they don't — never invent numbers".
 * An absent `gen_ai.usage.*` attribute is ambiguous (not captured? zero?), so
 * this makes the absence itself explicit and queryable.
 */
export const ATTR_VG_USAGE_AVAILABLE = "vg.usage.available";

/** `"actual"` when parsed from CLI output, `"estimated"` when a config constant. */
export const ATTR_VG_COST_PROVENANCE = "vg.cost.provenance";
export const ATTR_VG_COST_USD = "vg.cost.usd";

export const COST_PROVENANCE_ACTUAL = "actual";
export const COST_PROVENANCE_ESTIMATED = "estimated";
export const COST_PROVENANCE_UNAVAILABLE = "unavailable";

/** Key under which W3C trace context travels inside a worker bootstrap payload. */
export const TRACE_CARRIER_PAYLOAD_KEY = "telemetry";
