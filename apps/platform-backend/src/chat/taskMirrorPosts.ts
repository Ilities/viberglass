import { Actions, Button, Card, CardText } from "chat";
import { CHAT_ACTION, MAX_OPTION_BUTTONS, answerValue, askValue } from "@viberglass/integration-core";
import { withPlainMentions, type AgentQuestion, type PartRange } from "@viberglass/types";

/** Under the shortest message limit of the chat services posted to (Slack takes about 4,000 characters); long replies end with a link to the rest. */
const REPLY_LIMIT = 3_000;

const DOING: Record<string, string> = {
  planning: "writing the plan",
  execution: "building",
  reply: "replying",
};

export function messagePost(author: string, body: string): { markdown: string } {
  return { markdown: `**${author}:** ${withPlainMentions(body)}` };
}

export function runStartedPost(step: string): { markdown: string } {
  return { markdown: `_The agent is ${DOING[step] ?? "working"}…_` };
}

export function runFailedPost(step: string, reason: string | null): { markdown: string } {
  const what = step === "execution" ? "build" : step === "planning" ? "plan" : step;
  return { markdown: `**The ${what} run failed**${reason ? `: ${reason}` : "."}` };
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

/** The build to ask for next, as a button: after a plan, or once a part's pull request is merged. */
export function nextBuildCard(ticketId: string, build: { label: string; parts?: PartRange }, intro = "Reply here to discuss it, mention me to ask for changes, or:") {
  return Card({
    children: [
      CardText(intro),
      Actions([Button({ id: CHAT_ACTION.ask, label: build.label, style: "primary", value: askValue(ticketId, "code", build.parts) })]),
    ],
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
