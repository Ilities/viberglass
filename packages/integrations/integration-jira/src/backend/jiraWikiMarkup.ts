/**
 * Markdown as Jira wiki markup, for the comments Viberglass posts: headings,
 * bold, italics, inline code, code blocks, links and lists. Anything else
 * reads well enough as it is.
 */
export function markdownToJiraWiki(markdown: string): string {
  const parts = markdown.split(/```[^\n]*\n([\s\S]*?)```/)
  return parts.map((part, index) => (index % 2 === 1 ? `{code}\n${part.replace(/\n$/, '')}\n{code}` : convertText(part))).join('')
}

function convertText(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^(#{1,6})\s+(.*)$/, (_match, hashes: string, title: string) => `h${hashes.length}. ${title}`)
        .replace(/^(\s*)[-*]\s+/, (_match, indent: string) => `${'*'.repeat(Math.floor(indent.length / 2) + 1)} `)
        .replace(/^(\s*)\d+\.\s+/, (_match, indent: string) => `${'#'.repeat(Math.floor(indent.length / 2) + 1)} `),
    )
    .join('\n')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '[$1|$2]')
    .replace(/`([^`]+)`/g, '{{$1}}')
    .replace(/\*\*([^*]+)\*\*/g, '\u0000$1\u0000')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1_$2_')
    .replace(/\u0000/g, '*')
}
