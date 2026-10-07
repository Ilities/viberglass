import { withPlainMentions, type AgentQuestion } from "@viberglass/types";

/** Trackers cap comment length; a long reply ends with a link to the rest. */
const REPLY_LIMIT = 4_000;
const SUMMARY_LIMIT = 500;

const linkLine = (taskLink: string | null, text: string): string => (taskLink ? `\n\n[${text}](${taskLink})` : "");

/** The plan's opening paragraph, which says what was found and what would change. */
export function planSummary(plan: string): string {
  const paragraph =
    plan
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .find((block) => block && !block.startsWith("#") && !block.startsWith("|") && !block.startsWith("```")) ?? "";
  return paragraph.length > SUMMARY_LIMIT ? `${paragraph.slice(0, SUMMARY_LIMIT - 1)}…` : paragraph;
}

export function planReadyPost(plan: string, taskLink: string | null): string {
  const summary = planSummary(plan);
  return `**The plan is ready.**${summary ? `\n\n${summary}` : ""}${linkLine(taskLink, "Read and review the plan in Viberglass")}`;
}

export function replyPost(agent: string, reply: string, taskLink: string | null): string {
  const text = withPlainMentions(reply.trim()) || "Finished its turn.";
  const cut = text.length > REPLY_LIMIT ? `${text.slice(0, REPLY_LIMIT - 1)}…${linkLine(taskLink, "Read the rest in Viberglass")}` : text;
  return `**${agent}:** ${cut}`;
}

export function questionPost(question: AgentQuestion, taskLink: string | null): string {
  const asks = question.askedOf ? `${question.agent.name} asks ${question.askedOf.name}` : `${question.agent.name} asks`;
  const options = question.options.length > 0 ? `\n\n${question.options.map((option) => `- ${option}`).join("\n")}` : "";
  return `**${asks}:** ${question.question}${options}\n\nReply here to answer, or answer in Viberglass.${linkLine(taskLink, "Open the task")}`;
}

export function pullRequestPost(pullRequestUrl: string): string {
  return `**Pull request opened:** ${pullRequestUrl}`;
}

export function partMergedPost(parts: number[]): string {
  const which = parts.length === 1 ? `Part ${parts[0]}` : `Parts ${parts.join(", ")}`;
  return `**${which} merged.** The next part can be built.`;
}

export const DONE_POST = "**Done.**";
