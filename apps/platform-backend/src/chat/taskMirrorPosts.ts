import { Actions, Button, Card, CardText } from "chat";
import { CHAT_ACTION, MAX_OPTION_BUTTONS, answerValue, askValue } from "@viberglass/integration-core";
import { savedFilesLine, withPlainMentions, type AgentQuestion, type SpaceFilesSnapshotSummary, type TurnRunLabel, type WorkOffer } from "@viberglass/types";

/** Under the shortest message limit of the chat services posted to (Slack takes about 4,000 characters); long replies end with a link to the rest. */
const REPLY_LIMIT = 3_000;

export function messagePost(author: string, body: string): { markdown: string } {
  return { markdown: `**${author}:** ${withPlainMentions(body)}` };
}

/** Without a label, the run isn't a task's turn, so it isn't known what it does. */
export function runStartedPost(label: TurnRunLabel | null): { markdown: string } {
  return { markdown: `_The agent is ${label?.doing ?? "working"}…_` };
}

export function runFailedPost(label: TurnRunLabel | null, reason: string | null): { markdown: string } {
  return { markdown: `**The ${label ? `${label.run} run` : "run"} failed**${reason ? `: ${reason}` : "."}` };
}

/** What the agent said in its turn, with a link to the task when it had more to say than fits. */
export function replyPost(agent: string, reply: string, taskLink: string | null): { markdown: string } {
  const text = reply.trim() || "Finished its turn.";
  const cut = text.length > REPLY_LIMIT ? `${text.slice(0, REPLY_LIMIT - 1)}…${taskLink ? `\n\n[Read the rest in Viberglass](${taskLink})` : ""}` : text;
  return { markdown: `**${agent}:** ${cut}` };
}

export function documentPost(content: string, version: number | null): { markdown: string; files: Array<{ data: Buffer; filename: string; mimeType: string }> } {
  return {
    markdown: `_Plan${version ? ` v${version}` : ""}:_`,
    files: [{ data: Buffer.from(content), filename: "plan.md", mimeType: "text/markdown" }],
  };
}

/** What a Files turn saved, in a line. */
export function savedFilesPost(files: SpaceFilesSnapshotSummary): { markdown: string } {
  return { markdown: `_${savedFilesLine(files)}_` };
}

/**
 * The work to ask for next, as buttons: after a plan, an artifact, or once a
 * part's pull request is merged. A Files task can be marked done from it too.
 */
export function nextWorkCard(
  ticketId: string,
  offers: WorkOffer[],
  options: { intro?: string; markDone?: boolean } = {},
) {
  const buttons = offers.map((offer, index) =>
    Button({ id: CHAT_ACTION.ask, label: offer.label, style: index === 0 ? "primary" : undefined, value: askValue(ticketId, offer.action, offer.parts) }),
  );
  if (options.markDone) buttons.push(Button({ id: CHAT_ACTION.markDone, label: "Mark done", value: ticketId }));
  return Card({
    children: [CardText(options.intro ?? "Reply here to discuss it, mention me to ask for changes, or:"), Actions(buttons)],
  });
}

/** "Part 1 is merged.": a merged pull request that built some of the plan, with more to build. */
export function partMergedPost(parts: number[], mergedBy: string | null): { markdown: string } {
  const merged = parts.length > 0 ? `Part ${parts.join(", ")}` : "A part of the plan";
  return { markdown: `**${merged} is merged**${mergedBy ? ` by ${mergedBy}` : ""}.` };
}

/** The agent's question, with its options as buttons; a reply in the thread from the person asked answers it too. */
export function questionCard(question: AgentQuestion) {
  const who = question.askedOf ? `${question.agent.name} asks ${question.askedOf.name}` : `${question.agent.name} asks`;
  const children = [
    CardText(question.question),
    ...(question.options.length > 0
      ? [
          Actions(
            question.options
              .slice(0, MAX_OPTION_BUTTONS)
              .map((option, index) => Button({ id: CHAT_ACTION.answers[index], label: option, value: answerValue(question.id, index) })),
          ),
        ]
      : []),
    CardText(question.askedOf ? `${question.askedOf.name}, reply in this thread to answer.` : "Reply in this thread to answer."),
  ];
  return Card({ title: who, children });
}

export function answeredPost(question: AgentQuestion): { markdown: string } | null {
  if (!question.answer) return null;
  return { markdown: `_${question.answer.by?.name ?? "Someone"} answered ${question.agent.name}: ${question.answer.text}_` };
}
