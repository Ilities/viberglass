/**
 * Joins streamed assistant_message chunks into whole messages.
 *
 * The worker records one event per ACP agent_message_chunk, often only a few
 * tokens long, so a chat thread needs the chunks joined before posting.
 */
export class AssistantMessageCoalescer {
  private chunks: string[] = [];

  append(text: string): void {
    this.chunks.push(text);
  }

  /** Returns the buffered message and clears it, or null when there's nothing to post. */
  flush(): string | null {
    const message = this.chunks.join("").trim();
    this.chunks = [];
    return message.length > 0 ? message : null;
  }
}
