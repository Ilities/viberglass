/** The issue a task is linked to, as the tracker names it. */
export interface TrackerIssue {
  /** "PROJ-12" in Jira, the story id in Shortcut, "owner/repo#12" on GitHub. */
  key: string
  url: string | null
  /** The tracker's API address when it differs per site, as for Jira. */
  apiBaseUrl: string | null
}

/** Posts to a tracker issue as the connection's account. */
export interface TrackerCommenter {
  /** Posts a comment written in Markdown; each tracker converts it to its own format. */
  postComment(issue: TrackerIssue, markdown: string): Promise<void>
}

/**
 * Ends every comment Viberglass posts, so when the tracker sends it back as a
 * new comment it's recognised and not taken as someone writing in the thread.
 */
export const VIBERGLASS_COMMENT_MARK = '— via Viberglass'

export function isViberglassComment(body: string): boolean {
  return body.trimEnd().endsWith(VIBERGLASS_COMMENT_MARK)
}

export function withViberglassMark(markdown: string): string {
  return `${markdown.trimEnd()}\n\n${VIBERGLASS_COMMENT_MARK}`
}
