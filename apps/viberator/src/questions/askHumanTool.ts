/** What the agent asks with: the question, who should answer it, and whether it can carry on meanwhile. */
export interface AskHumanInput {
  question: string;
  options: string[];
  /** "requester", "owner", "reviewer", or a person's name; the platform resolves it to someone on the task. */
  addressee: string | null;
  blocking: boolean;
}

export const ASK_HUMAN_TOOL = {
  name: "ask_human",
  description: [
    "Ask a person on this task something only they can answer: a decision, a preference, or a fact you can't find in the code or the task.",
    "Use it instead of writing \"needs confirmation\" or a guess into a document.",
    "Ask one clear question. Offer options when the answer is a choice.",
    "Set blocking to true when you can't go on without the answer: then end your turn, and the answer comes as your next message.",
    "Set it to false to carry on with an assumption you state in your reply; the answer comes later.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "The question, in plain words, with the context the person needs to answer it." },
      options: { type: "array", items: { type: "string" }, description: "Answers to choose from, when the answer is a choice." },
      addressee: {
        type: "string",
        description: "Who should answer: \"requester\" (who asked for the task), \"owner\", \"reviewer\", or the name of a person on the task. Defaults to the owner.",
      },
      blocking: { type: "boolean", description: "Whether you have to stop until it's answered. Defaults to true." },
    },
    required: ["question"],
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The tool's arguments, or why they can't be used. */
export function parseAskHumanInput(args: unknown): AskHumanInput | { error: string } {
  if (!isRecord(args) || typeof args.question !== "string" || !args.question.trim()) {
    return { error: "ask_human needs a question." };
  }
  const options = Array.isArray(args.options)
    ? args.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0).map((option) => option.trim())
    : [];
  const addressee = typeof args.addressee === "string" && args.addressee.trim() ? args.addressee.trim() : null;
  return { question: args.question.trim(), options, addressee, blocking: args.blocking !== false };
}

/** What the tool tells the agent once the question is with someone. */
export function askedReply(askedOf: string | null, blocking: boolean): string {
  const who = askedOf ?? "the people on the task";
  if (blocking) {
    return `Your question is with ${who}. End your turn now: say in one line what you're waiting on, and don't guess the answer. Their answer will be your next message.`;
  }
  return `Your question is with ${who}. Carry on with the assumption you stated; their answer will come in a later message, and you can revise your work then.`;
}
