import db from "../../apps/platform-backend/src/persistence/config/database";
import { ArtifactDAO } from "../../apps/platform-backend/src/persistence/artifacts/ArtifactDAO";
import { ClawTaskTemplateDAO } from "../../apps/platform-backend/src/persistence/claw/ClawTaskTemplateDAO";
import { IntegrationDAO } from "../../apps/platform-backend/src/persistence/integrations/IntegrationDAO";
import { SpaceFilesDAO } from "../../apps/platform-backend/src/persistence/spaceFiles/SpaceFilesDAO";
import { TrackerIssueRuleDAO } from "../../apps/platform-backend/src/persistence/trackers/TrackerIssueRuleDAO";
import { WebhookConfigDAO } from "../../apps/platform-backend/src/persistence/webhook/WebhookConfigDAO";
import { ArtifactRegistrar } from "../../apps/platform-backend/src/services/artifacts/ArtifactRegistrar";
import { ClawScheduleService } from "../../apps/platform-backend/src/services/claw/ClawScheduleService";
import { SpaceFilesEditService } from "../../apps/platform-backend/src/services/spaceFiles/SpaceFilesEditService";
import { S3SpaceFilesStore } from "../../apps/platform-backend/src/services/spaceFiles/SpaceFilesStore";
import { BRAND_VOICE, DECK_CSS, DECK_HTML, DECK_PLAN, INTERVIEWS, RELEASE_NOTES } from "./content";
import { planComment, planVersion } from "./seedReviews";
import { hoursAgo, message, run, session, type Runner } from "./seedSupport";
import { createTask, type Person } from "./storefront";

export async function seedProductMarketing(input: { projectId: string; claude: Runner; you: Person; maria: Person; aino: Person; tomi: Person }): Promise<void> {
  const { projectId, claude, you, maria, aino } = input;
  const files = new SpaceFilesEditService();
  for (const [path, content] of [
    ["notes/brand-voice.md", BRAND_VOICE],
    ["notes/q3-release-notes.md", RELEASE_NOTES],
    ["research/customer-interviews.md", INTERVIEWS],
  ]) {
    await files.upload(projectId, maria.id, path, Buffer.from(content));
  }

  const ticket = await createTask(
    projectId,
    "Q3 product update deck",
    "A short deck for the customer webinar on 30 October: what shipped this quarter, in our brand voice. Use the release notes and the September interviews.",
    maria,
    maria,
    hoursAgo(26),
    [input.tomi],
  );
  const s = await session(ticket.id, projectId, claude, maria.id, hoursAgo(25.9));
  const plan = await run({
    session: s,
    action: "plan",
    status: "completed",
    startedAt: hoursAgo(25.8),
    minutes: 4,
    ask: { userId: maria.id, text: "Write a plan" },
    intent: "I'll outline the deck from the release notes and interviews.",
    reply: "The outline has seven slides. Aino, does the order work for the webinar?",
    produced: ["plan"],
    mentioned: [{ id: aino.id, name: aino.name }],
    repository: "",
    jobKind: "reply",
    costUsd: 0.21,
  });
  const documentId = await planVersion(ticket.id, DECK_PLAN, plan.finishedAt, plan.turnId);
  await planComment(ticket.id, documentId, DECK_PLAN, "lead with the 3× faster charts", "Yes, open with the speed. It's what customers asked about most in the interviews.", { id: aino.id, email: aino.email }, hoursAgo(24));
  await message(ticket.id, maria.id, "Looks good. Build the deck, and keep every slide to one headline.", hoursAgo(23.5));

  for (const [path, content] of [
    ["deck/index.html", DECK_HTML],
    ["deck/style.css", DECK_CSS],
  ]) {
    await files.upload(projectId, maria.id, path, Buffer.from(content));
  }
  const { snapshot } = await new SpaceFilesDAO().getCurrent(projectId);
  if (!snapshot) throw new Error("The Files space has no saved files");

  const build = await run({
    session: s,
    action: "code",
    status: "completed",
    startedAt: hoursAgo(23.4),
    minutes: 6,
    ask: { userId: maria.id, text: "Build the deck" },
    intent: "I'll build the seven slides as an HTML deck.",
    reply: "The deck is ready: seven slides, one headline each, with the interview quote on slide 5.",
    repository: "",
    jobKind: "reply",
    costUsd: 0.58,
    files: {
      id: snapshot.id,
      parentId: null,
      fileCount: snapshot.manifest.length,
      totalBytes: snapshot.manifest.reduce((sum, entry) => sum + entry.bytes, 0),
      partial: false,
      changes: { added: 2, changed: 0, removed: 0 },
      createdAt: hoursAgo(23.3).toISOString(),
    },
  });

  const store = new S3SpaceFilesStore();
  const registrar = new ArtifactRegistrar(store);
  const declared = await registrar.fromDeclaration({ artifacts: [{ title: "Q3 product update deck", entrypoint: "deck/index.html", files: ["deck/"] }] }, snapshot.manifest, {
    projectId,
    ticketId: ticket.id,
    jobId: build.jobId,
    createdBy: null,
    snapshotId: snapshot.id,
  });
  if ("error" in declared) throw new Error(declared.error);
  await registrar.storeFiles(() => store.open(snapshot.storageUrl), declared.versions);
  const artifacts = await db.transaction().execute((trx) => new ArtifactDAO().insertVersions(trx, declared.versions));
  const turn = await db.selectFrom("agent_turns").select("content_json").where("id", "=", build.turnId).executeTakeFirstOrThrow();
  const outcome = typeof turn.content_json === "string" ? JSON.parse(turn.content_json) : turn.content_json;
  await db.updateTable("agent_turns").set({ content_json: JSON.stringify({ ...outcome, artifacts }) }).where("id", "=", build.turnId).execute();

  const template = await new ClawTaskTemplateDAO().createTemplate({
    projectId,
    name: "Weekly feedback summary",
    description: "Summarises last week's customer feedback into notes/feedback/.",
    clankerId: claude.id,
    taskInstructions: "Read last week's support tickets and interview notes, and write the five most common requests to notes/feedback/<date>.md.",
  });
  await new ClawScheduleService().createSchedule(
    { projectId, taskTemplateId: template.id, name: "Monday feedback summary", description: "Every Monday at 9:00", scheduleType: "cron", cronExpression: "0 0 9 * * 1", timezone: "Europe/Helsinki", isActive: true },
    you.id,
  );
}

export async function seedTokenObserver(input: { projectId: string; claude: Runner; github: { id: string }; you: Person; dev: Person }): Promise<void> {
  const integrations = new IntegrationDAO();
  const jira = await integrations.createIntegration({ name: "Acme Jira", system: "jira", config: { instanceUrl: "https://acme.atlassian.net", email: "jira-bot@acme.example" } });
  const shortcut = await integrations.createIntegration({ name: "Acme Shortcut", system: "shortcut", config: {} });
  const webhooks = new WebhookConfigDAO();
  for (const [integration, provider] of [
    [input.github, "github"],
    [jira, "jira"],
    [shortcut, "shortcut"],
  ] as const) {
    await webhooks.createConfig({ projectId: null, provider, integrationId: integration.id, secretLocation: "database", allowedEvents: [], active: true });
  }
  const rules = new TrackerIssueRuleDAO();
  await rules.replaceForSpace(input.projectId, input.github.id, [{ label: null, planNewIssues: false }]);
  await rules.replaceForSpace(input.projectId, jira.id, [
    { label: "viberglass", planNewIssues: true },
    { label: "agent-ready", planNewIssues: true },
  ]);
  await rules.replaceForSpace(input.projectId, shortcut.id, [{ label: "token-observer", planNewIssues: false }]);

  for (const [title, hours] of [
    ["Add the K2 Horizon models to the tracker", 40],
    ["Missing Liquid AI models", 70],
  ] as const) {
    const ticket = await createTask(input.projectId, title, `${title}, with their context windows and prices.`, input.dev, input.dev, hoursAgo(hours));
    const s = await session(ticket.id, input.projectId, input.claude, input.dev.id, hoursAgo(hours - 0.1));
    const plan = await run({ session: s, action: "plan", status: "completed", startedAt: hoursAgo(hours - 0.2), minutes: 5, ask: { userId: input.dev.id, text: "Write a plan" }, intent: "I'll check the model list and write a plan.", reply: "The plan is ready.", produced: ["plan"], repository: "https://github.com/ilities/token.observer", costUsd: 0.29 });
    await planVersion(ticket.id, `# Plan: ${title.toLowerCase()}\n\n1. Add each model to \`data/models.json\`.\n2. Regenerate the comparison table.\n`, plan.finishedAt, plan.turnId);
  }
}

export async function seedPayments(input: { projectId: string; you: Person; dev: Person }): Promise<void> {
  await createTask(input.projectId, "Retry failed card payments once", "Card payments that fail with a network error should be retried once before we show an error.", input.dev, input.dev, hoursAgo(80));
  await createTask(input.projectId, "Show refunds in the customer's order history", "Refunded orders show as 'Paid'. Show the refund and its date.", input.you, input.dev, hoursAgo(14));
}
