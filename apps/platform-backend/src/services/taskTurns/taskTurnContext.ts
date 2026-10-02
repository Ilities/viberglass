import type { PullRequestReviewComment, TaskArtifactKind } from "@viberglass/types";
import type { PhaseDocumentComment } from "../../persistence/ticketing/TicketPhaseDocumentCommentDAO";

export interface TurnMessage {
  /** Null when the body already names its speaker ("[Name]: …", from a live session). */
  author: string | null;
  body: string;
  at: Date;
  via: "thread" | "session";
  /** The agent's question this message answers. */
  inAnswerTo?: string;
}

/** Someone on the task, with their roles on it, so the agent can ask them by name. */
export interface TurnPerson {
  name: string;
  roles: string[];
}

export interface TurnComment {
  artifact: TaskArtifactKind;
  comment: PhaseDocumentComment;
}

export interface TurnEdit {
  artifact: TaskArtifactKind;
  by: string;
  content: string;
}

/**
 * Everything a turn's prompt is built from. `fresh` is what the agent hasn't
 * seen; `earlier` is what it has, for when it has to start over cold.
 */
export interface TaskTurnContext {
  ticket: {
    title: string;
    description: string;
    externalTicketId: string | null;
    pullRequestUrl: string | null;
  };
  documents: { research: string; plan: string };
  people: TurnPerson[];
  /** The last commit an agent's build pushed to the task's branch; what people pushed since is news to it. */
  lastAgentCommit: string | null;
  /** The latest summary of the conversation; empty before the first. */
  summary: string;
  /** When this agent was last prompted on the task; null on its first turn. */
  since: Date | null;
  earlier: { messages: TurnMessage[]; openComments: TurnComment[] };
  fresh: {
    messages: TurnMessage[];
    comments: TurnComment[];
    edits: TurnEdit[];
    pullRequestComments: PullRequestReviewComment[];
  };
}
