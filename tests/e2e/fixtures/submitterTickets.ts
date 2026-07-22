import type {
  JobFailure,
  JobStatus,
  TicketLifecycleStatus,
  TicketWorkflowPhase,
} from "@viberglass/types";

export const SUBMITTER_FIXTURE_IDS = {
  project: "10000000-0000-4000-8000-000000000001",
  ready: "20000000-0000-4000-8000-000000000001",
  misconfigured: "20000000-0000-4000-8000-000000000002",
  running: "20000000-0000-4000-8000-000000000003",
  failed: "20000000-0000-4000-8000-000000000004",
  cancelled: "20000000-0000-4000-8000-000000000005",
  completed: "20000000-0000-4000-8000-000000000006",
} as const;

export interface SubmitterTicketFixture {
  id: string;
  title: string;
  phase: TicketWorkflowPhase;
  status: TicketLifecycleStatus;
  automationAvailable: boolean;
  runStatus?: JobStatus;
  document?: string;
  failure?: JobFailure;
  pullRequestUrl?: string;
  expectedPrimaryAction: string;
}

export const SUBMITTER_FIXTURES: readonly SubmitterTicketFixture[] = [
  {
    id: SUBMITTER_FIXTURE_IDS.ready,
    title: "Ready for research",
    phase: "research",
    status: "open",
    automationAvailable: true,
    expectedPrimaryAction: "Run Research",
  },
  {
    id: SUBMITTER_FIXTURE_IDS.misconfigured,
    title: "Repository setup required",
    phase: "research",
    status: "open",
    automationAvailable: false,
    expectedPrimaryAction: "Configure repository",
  },
  {
    id: SUBMITTER_FIXTURE_IDS.running,
    title: "Research in progress",
    phase: "research",
    status: "in_progress",
    automationAvailable: true,
    runStatus: "active",
    expectedPrimaryAction: "View progress",
  },
  {
    id: SUBMITTER_FIXTURE_IDS.failed,
    title: "Repository access failed",
    phase: "execution",
    status: "open",
    automationAvailable: true,
    runStatus: "failed",
    failure: {
      code: "REPOSITORY_ACCESS_FAILED",
      summary: "Viberglass could not access the configured repository.",
      technicalDetail: "Git clone failed: repository not found",
      retryable: false,
    },
    expectedPrimaryAction: "Fix setup",
  },
  {
    id: SUBMITTER_FIXTURE_IDS.cancelled,
    title: "Cancelled planning retained",
    phase: "planning",
    status: "open",
    automationAvailable: true,
    runStatus: "cancelled",
    document: "# Planning\n\nPartial plan retained after cancellation.",
    expectedPrimaryAction: "Run Plan",
  },
  {
    id: SUBMITTER_FIXTURE_IDS.completed,
    title: "Pull request ready for review",
    phase: "execution",
    status: "in_review",
    automationAvailable: true,
    runStatus: "completed",
    pullRequestUrl: "https://example.test/viberglass/pull/42",
    expectedPrimaryAction: "View PR",
  },
];
