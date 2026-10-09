function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether a comment mentions the connection's bot account, in any of the
 * tracker's ways of writing a mention, and the comment without those mentions.
 */
export function takeBotMention(body: string, mentionForms: string[]): { mentionsBot: boolean; body: string } {
  const forms = mentionForms.filter(Boolean).map(escapeRegExp);
  if (forms.length === 0) return { mentionsBot: false, body };
  // A form ending in a word character can't be followed by another, so "@bot" doesn't match "@bottle".
  const pattern = new RegExp(`(?:${forms.map((form) => (/\w$/.test(form) ? `${form}(?![\\w-])` : form)).join("|")})`, "gi");
  const stripped = body.replace(pattern, "");
  if (stripped === body) return { mentionsBot: false, body };
  return { mentionsBot: true, body: stripped.replace(/[ \t]{2,}/g, " ").replace(/^[\s,:]+/, "").trim() };
}
