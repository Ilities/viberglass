const INTENT_LIMIT = 200;

/**
 * The agent's first sentence, without the markdown it may start with: what it
 * set out to do, as a whole sentence for Home and the thread rather than a
 * line cut off mid-thought.
 */
export function intentOf(reply: string): string | null {
  const line = reply
    .split("\n")
    .map((entry) => entry.replace(/^[\s#>*_-]+/, "").replace(/\*\*|__|`/g, "").trim())
    .find((entry) => entry.length > 0);
  if (!line) return null;
  const sentence = /^.+?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
  return sentence.length > INTENT_LIMIT ? `${sentence.slice(0, INTENT_LIMIT - 1)}…` : sentence;
}
