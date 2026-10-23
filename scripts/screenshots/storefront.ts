import { NATIVE_TICKET_ORIGIN } from "@viberglass/types";
import db from "../../apps/platform-backend/src/persistence/config/database";
import { TaskParticipantDAO } from "../../apps/platform-backend/src/persistence/ticketing/TaskParticipantDAO";
import { TicketDAO } from "../../apps/platform-backend/src/persistence/ticketing/TicketDAO";
import {
  DELIVERY_ESTIMATE_QUESTION,
  FREE_SHIPPING_PLAN_V1,
  FREE_SHIPPING_PLAN_V2,
  FREE_SHIPPING_QUESTION,
  GIFT_NOTE_PLAN,
} from "./content";
import { planComment, planVersion, pullRequest } from "./seedReviews";
import { activity, backdateTask, hoursAgo, message, question, run, session, type Runner } from "./seedSupport";

export interface Person {
  id: string;
  name: string;
  email: string;
}

export interface StorefrontInput {
  projectId: string;
  repository: string;
  claude: Runner;
  opencode: Runner;
  you: Person;
  maria: Person;
  dev: Person;
  aino: Person;
  tomi: Person;
}

const tickets = new TicketDAO();
const participants = new TaskParticipantDAO();

export async function createTask(projectId: string, title: string, description: string, requester: Person, owner: Person, createdAt: Date, watchers: Person[] = []) {
  const ticket = await tickets.createTicket({
    projectId,
    title,
    description,
    severity: "medium",
    category: "General",
    ticketSystem: NATIVE_TICKET_ORIGIN,
    metadata: { timestamp: createdAt.toISOString(), timezone: "Europe/Helsinki" },
    annotations: [],
    autoFixRequested: false,
    requesterId: requester.id,
    ownerId: owner.id,
    watcherIds: watchers.map((person) => person.id),
  });
  await backdateTask(ticket.id, createdAt);
  return ticket;
}

/** A finished task in the space's history: planned, built, and its pull request decided. */
interface HistoryTask {
  title: string;
  runner: "claude" | "opencode";
  planRounds: number;
  questions: number;
  outcome: "merged" | "closed";
  reviewComments: number;
  failedRuns?: number;
  takenOver?: boolean;
  hoursAgo: number;
}

const HISTORY: HistoryTask[] = [
  { title: "Add product reviews to search results", runner: "claude", planRounds: 1, questions: 0, outcome: "merged", reviewComments: 1, hoursAgo: 520 },
  { title: "Fix broken alt texts on product images", runner: "opencode", planRounds: 1, questions: 0, outcome: "merged", reviewComments: 0, hoursAgo: 500 },
  { title: "Show stock levels on product cards", runner: "claude", planRounds: 2, questions: 1, outcome: "merged", reviewComments: 2, hoursAgo: 470 },
  { title: "Translate checkout into Swedish", runner: "opencode", planRounds: 2, questions: 1, outcome: "merged", reviewComments: 4, failedRuns: 1, hoursAgo: 430 },
  { title: "Fix VAT rounding on invoices", runner: "claude", planRounds: 1, questions: 1, outcome: "merged", reviewComments: 0, hoursAgo: 400 },
  { title: "Add order notes to the admin order view", runner: "opencode", planRounds: 1, questions: 0, outcome: "closed", reviewComments: 6, takenOver: true, hoursAgo: 360 },
  { title: "Let customers save a cart for later", runner: "claude", planRounds: 1, questions: 0, outcome: "merged", reviewComments: 1, hoursAgo: 330 },
  { title: "Hide sold-out sizes in the size picker", runner: "opencode", planRounds: 1, questions: 0, outcome: "merged", reviewComments: 1, hoursAgo: 300 },
  { title: "Add Klarna to the payment options", runner: "claude", planRounds: 3, questions: 2, outcome: "merged", reviewComments: 3, hoursAgo: 260 },
  { title: "Update the cookie banner copy", runner: "opencode", planRounds: 1, questions: 0, outcome: "merged", reviewComments: 0, hoursAgo: 230 },
  { title: "Speed up category page filters", runner: "claude", planRounds: 1, questions: 0, outcome: "merged", reviewComments: 2, failedRuns: 1, hoursAgo: 190 },
  { title: "Add a newsletter opt-in at checkout", runner: "opencode", planRounds: 2, questions: 1, outcome: "closed", reviewComments: 5, hoursAgo: 150 },
  { title: "Add a size guide to apparel pages", runner: "claude", planRounds: 1, questions: 0, outcome: "merged", reviewComments: 1, hoursAgo: 110 },
];

async function historyTask(input: StorefrontInput, task: HistoryTask, number: number): Promise<string> {
  const runner = task.runner === "claude" ? input.claude : input.opencode;
  const owner = number % 2 === 0 ? input.maria : input.tomi;
  const start = hoursAgo(task.hoursAgo);
  const ticket = await createTask(input.projectId, task.title, `${task.title}. Details in the product brief.`, owner, owner, start);
  const s = await session(ticket.id, input.projectId, runner, owner.id, start);
  let at = new Date(start.getTime() + 10 * 60_000);
  const step = (minutes: number) => (at = new Date(at.getTime() + minutes * 60_000));

  for (let round = 1; round <= task.planRounds; round++) {
    const planRun = await run({
      session: s,
      action: "plan",
      status: "completed",
      startedAt: at,
      minutes: 6,
      ask: { userId: owner.id, text: round === 1 ? "Write a plan" : "Revise the plan with the feedback above" },
      intent: round === 1 ? "I'll read the code and write a plan." : "I'll revise the plan with the feedback.",
      reply: "The plan is ready for review.",
      produced: ["plan"],
      repository: input.repository,
      costUsd: task.runner === "claude" ? 0.38 : 0.06,
    });
    await planVersion(ticket.id, `# Plan: ${task.title.toLowerCase()}\n\nRound ${round}.`, planRun.finishedAt, planRun.turnId);
    if (round <= task.questions) {
      await question(s, planRun.turnId, planRun.jobId, { question: "Which behaviour do you want on mobile?", options: ["Same as desktop", "Simplified"], addresseeId: owner.id, at: step(8) }, {
        by: owner.id,
        text: "Same as desktop.",
        at: step(40),
      });
    }
    step(120);
  }
  for (let failed = 0; failed < (task.failedRuns ?? 0); failed++) {
    await run({ session: s, action: "code", status: "failed", startedAt: at, minutes: 9, ask: { userId: owner.id, text: "Build it" }, intent: "I'll build the plan.", reply: "", repository: input.repository, costUsd: 0.12 });
    step(60);
  }
  const branch = `viberglass/${ticket.key.toLowerCase()}`;
  const url = `https://github.com/acme/storefront/pull/${120 + number}`;
  await run({
    session: s,
    action: "code",
    status: "completed",
    startedAt: at,
    minutes: 18,
    ask: { userId: owner.id, text: "Build it" },
    intent: "I'll build the plan and open a pull request.",
    reply: `Built it and opened ${url}.`,
    produced: ["code"],
    repository: input.repository,
    pullRequestUrl: url,
    branch,
    costUsd: task.runner === "claude" ? 1.84 : 0.31,
  });
  if (task.takenOver) await activity(ticket.id, "taken_over", input.dev.id, { userId: input.dev.id }, step(30));
  await pullRequest(ticket.id, branch, url, { state: task.outcome, reviewComments: task.reviewComments, at: step(24 * 60) });
  if (task.outcome === "merged") await activity(ticket.id, "pull_request_merged", null, { pullRequestUrl: url, merged: true, mergedBy: "devpatel" }, at);
  return ticket.id;
}

/** The space's tasks: a finished history, then the work in flight. Returns the tasks that are done. */
export async function seedStorefront(input: StorefrontInput): Promise<{ done: string[] }> {
  const done: string[] = [];
  for (const [index, task] of HISTORY.entries()) done.push(await historyTask(input, task, index));

  await freeShipping(input);
  await deliveryEstimates(input);
  await giftNote(input);
  await welcomeText(input);
  await imageLoading(input);
  await cartRounding(input);
  await createTask(
    input.projectId,
    "Rewrite the order confirmation email",
    "The confirmation email still says 'Your order has been received'. Rewrite it in our brand voice, and show the delivery estimate and the free shipping line.",
    input.tomi,
    input.tomi,
    hoursAgo(5),
  );
  return { done };
}

async function freeShipping(input: StorefrontInput): Promise<void> {
  const { maria, dev, you, claude } = input;
  const ticket = await createTask(
    input.projectId,
    "Free shipping over €100 for the autumn campaign",
    "From 1 November, orders over €100 ship free. Show customers how far they are from free shipping in the cart. The threshold should be easy to change for future campaigns.",
    maria,
    maria,
    hoursAgo(30),
    [input.tomi],
  );
  await participants.add(ticket.id, dev.id, "reviewer", maria.id);
  await activity(ticket.id, "reviewer_added", maria.id, { userId: dev.id }, hoursAgo(29.9));
  const s = await session(ticket.id, input.projectId, claude, maria.id, hoursAgo(29.8));

  const first = await run({
    session: s,
    action: "plan",
    status: "completed",
    startedAt: hoursAgo(29.8),
    minutes: 7,
    ask: { userId: maria.id, text: "Write a plan" },
    intent: "I'll read the checkout code and write a plan for the free shipping threshold.",
    reply: "The plan is ready. One thing I need from Maria before it's final: whether discount codes count toward the threshold.",
    produced: ["plan"],
    mentioned: [{ id: maria.id, name: maria.name }],
    repository: input.repository,
    inputTokens: 61_200,
    outputTokens: 4_350,
    costUsd: 0.47,
    transcript: [
      { kind: "reasoning", text: "Shipping is priced somewhere in checkout. Let me find where, and how discount codes interact with it." },
      { kind: "tool", text: "", tool: { name: "grep", toolKind: "search", input: { pattern: "shippingPrice" }, output: "src/checkout/shipping.ts:12\nsrc/checkout/CartSummary.tsx:48" } },
      { kind: "tool", text: "", tool: { name: "read", toolKind: "read", input: { filePath: "src/checkout/shipping.ts" }, output: "export function shippingPrice(total: Money) {\n  return total.amount < 50 ? eur(4.9) : eur(2.9)\n}" } },
      { kind: "tool", text: "", tool: { name: "read", toolKind: "read", input: { filePath: "src/checkout/discounts.ts" }, output: "// Discount codes are applied before shipping is priced." } },
      { kind: "tool", text: "", tool: { name: "grep", toolKind: "search", input: { pattern: "150" }, output: "src/checkout/CartSummary.tsx:51: const FREE_SHIPPING_FROM = 150" } },
      { kind: "reasoning", text: "The €150 summer threshold is hard-coded in the cart. Discount codes reduce the total before shipping, so whether the threshold counts the discounted total is a product decision." },
      { kind: "tool", text: "", tool: { name: "write", toolKind: "edit", input: { filePath: "PLAN.md" }, output: "Wrote 1,240 bytes" } },
    ],
    logs: [
      "Cloning github.com/acme/storefront (main) into the workspace",
      "Checked out main at 4f2a91c",
      "Starting Claude Code 2.4.1 with claude-sonnet-5",
      "Agent finished: PLAN.md written",
      "Saved the plan (1,240 bytes)",
    ],
  });
  await planVersion(ticket.id, FREE_SHIPPING_PLAN_V1, first.finishedAt, first.turnId);
  await question(
    s,
    first.turnId,
    first.jobId,
    { question: FREE_SHIPPING_QUESTION.question, options: FREE_SHIPPING_QUESTION.options, addresseeId: maria.id, at: hoursAgo(29.65) },
    { by: maria.id, text: FREE_SHIPPING_QUESTION.answer, at: hoursAgo(27.2) },
  );

  const second = await run({
    session: s,
    action: "plan",
    status: "completed",
    startedAt: hoursAgo(27.1),
    minutes: 5,
    ask: { userId: maria.id, text: "Revise the plan with Maria's answer" },
    intent: "I'll count the threshold after discount codes and update the plan.",
    reply: "The threshold now uses the discounted total, and the confirmation email shows the free shipping line. Dev, could you check the config approach?",
    produced: ["plan"],
    mentioned: [{ id: dev.id, name: dev.name }],
    repository: input.repository,
    inputTokens: 54_800,
    outputTokens: 3_100,
    costUsd: 0.33,
  });
  const documentId = await planVersion(ticket.id, FREE_SHIPPING_PLAN_V2, second.finishedAt, second.turnId);
  await planComment(
    ticket.id,
    documentId,
    FREE_SHIPPING_PLAN_V2,
    "read from the campaign config so marketing can change it without a release",
    "Good. Let's keep the threshold per market in the same config, so Norway can use NOK 1,200 later without another change.",
    dev,
    hoursAgo(21),
  );
  await message(
    ticket.id,
    maria.id,
    `Per-market is a good call, @[${dev.name}](user:${dev.id}). Only Finland and Sweden for the campaign. @[${input.aino.name}](user:${input.aino.id}) can you check the wording of the cart hint before we build?`,
    hoursAgo(20.5),
    [dev.id, input.aino.id],
  );
}

async function deliveryEstimates(input: StorefrontInput): Promise<void> {
  const { you, opencode } = input;
  const ticket = await createTask(
    input.projectId,
    "Show delivery estimates on product pages",
    "Customers keep asking support when their order will arrive. Show an estimated delivery date on product pages, based on the visitor's postcode when we know it.",
    input.tomi,
    you,
    hoursAgo(4),
  );
  const s = await session(ticket.id, input.projectId, opencode, you.id, hoursAgo(3.9));
  const asking = await run({
    session: s,
    action: "plan",
    status: "blocked",
    startedAt: hoursAgo(3.8),
    minutes: 4,
    ask: { userId: you.id, text: "Write a plan" },
    intent: "I'll look at the carrier integrations before planning the estimate.",
    reply: "Both carriers are integrated, but they give different kinds of estimate. I've asked which one product pages should use.",
    repository: input.repository,
    costUsd: 0.05,
  });
  await question(s, asking.turnId, asking.jobId, { question: DELIVERY_ESTIMATE_QUESTION.question, options: DELIVERY_ESTIMATE_QUESTION.options, addresseeId: you.id, at: hoursAgo(3.73) });
}

async function giftNote(input: StorefrontInput): Promise<void> {
  const { you, claude } = input;
  const ticket = await createTask(input.projectId, "Add a gift note to checkout", "Let customers add a short gift note at checkout and print it on the packing slip.", input.aino, you, hoursAgo(50));
  const s = await session(ticket.id, input.projectId, claude, you.id, hoursAgo(49.9));
  const plan = await run({ session: s, action: "plan", status: "completed", startedAt: hoursAgo(49.8), minutes: 6, ask: { userId: you.id, text: "Write a plan" }, intent: "I'll write a plan for the gift note.", reply: "The plan is ready, in two parts.", produced: ["plan"], repository: input.repository, costUsd: 0.36 });
  await planVersion(ticket.id, GIFT_NOTE_PLAN, plan.finishedAt, plan.turnId);
  const url = "https://github.com/acme/storefront/pull/214";
  const branch = "viberglass/gift-note-at-checkout";
  await run({
    session: s,
    action: "code",
    status: "completed",
    startedAt: hoursAgo(26),
    minutes: 21,
    ask: { userId: you.id, text: "Build it" },
    intent: "I'll build both parts and open a pull request.",
    reply: `Built both parts with tests and opened ${url}. The packing slip template change needs the warehouse service deployed first.`,
    produced: ["code"],
    repository: input.repository,
    pullRequestUrl: url,
    branch,
    costUsd: 2.12,
  });
  await pullRequest(ticket.id, branch, url, { state: "open", reviewComments: 2, at: hoursAgo(25.6) });
}

async function welcomeText(input: StorefrontInput): Promise<void> {
  const { maria, dev, opencode } = input;
  const ticket = await createTask(input.projectId, "Change the welcome text to “Welcome to Acme”", "The home page hero still says 'Welcome to our store'. Change it to 'Welcome to Acme' in every language we support.", maria, maria, hoursAgo(9));
  const s = await session(ticket.id, input.projectId, opencode, maria.id, hoursAgo(8.9));
  const branch = "viberglass/welcome-to-acme";
  await run({ session: s, action: "code", status: "completed", startedAt: hoursAgo(8.8), minutes: 8, ask: { userId: maria.id, text: "Build it" }, intent: "I'll change the hero text in every locale.", reply: "Changed the hero text in en, fi and sv and pushed the branch.", produced: ["code"], repository: input.repository, branch, costUsd: 0.09 });
  await db.insertInto("task_pull_requests").values({ ticket_id: ticket.id, branch, url: null, created_at: hoursAgo(8.6) }).execute();
  await message(ticket.id, dev.id, "The Swedish string breaks the hero layout on small phones. I'll fix it locally and hand it back.", hoursAgo(2.2));
  await db.updateTable("tickets").set({ taken_over_by: dev.id, taken_over_at: hoursAgo(2.1) }).where("id", "=", ticket.id).execute();
  await db.updateTable("agent_sessions").set({ status: "paused" }).where("id", "=", s.id).execute();
  await activity(ticket.id, "taken_over", dev.id, { userId: dev.id }, hoursAgo(2.1));
}

async function imageLoading(input: StorefrontInput): Promise<void> {
  const { tomi, opencode } = input;
  const ticket = await createTask(input.projectId, "Speed up image loading on the home page", "The home page takes 4 seconds to show its first image on mobile. Lazy-load what's below the fold and serve smaller images to phones.", tomi, tomi, hoursAgo(6));
  const s = await session(ticket.id, input.projectId, opencode, tomi.id, hoursAgo(5.9));
  const plan = await run({ session: s, action: "plan", status: "completed", startedAt: hoursAgo(5.8), minutes: 5, ask: { userId: tomi.id, text: "Write a plan" }, intent: "I'll measure what the home page loads and plan the change.", reply: "The plan is ready.", produced: ["plan"], repository: input.repository, costUsd: 0.07 });
  await planVersion(ticket.id, "# Plan: faster home page images\n\n1. Lazy-load images below the fold.\n2. Serve 640px images to phones from the image CDN.\n", plan.finishedAt, plan.turnId);
  await run({ session: s, action: "code", status: "running", startedAt: hoursAgo(0.2), minutes: 0, ask: { userId: tomi.id, text: "Build it" }, intent: "", reply: "", repository: input.repository });
}

async function cartRounding(input: StorefrontInput): Promise<void> {
  const { aino, claude } = input;
  const ticket = await createTask(input.projectId, "Fix rounding in cart totals", "A cart with three €3.33 items shows €9.98 in the cart and €9.99 at payment.", aino, aino, hoursAgo(12));
  const s = await session(ticket.id, input.projectId, claude, aino.id, hoursAgo(11.9));
  await run({ session: s, action: "plan", status: "failed", startedAt: hoursAgo(11.8), minutes: 3, ask: { userId: aino.id, text: "Write a plan" }, intent: "I'll find where the cart rounds its totals.", reply: "", repository: input.repository, costUsd: 0.04 });
}
