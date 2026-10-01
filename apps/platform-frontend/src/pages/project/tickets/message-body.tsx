import { splitMentions } from '@viberglass/types'
import { renderInline } from './document-inline'

/** A message's text, with each @mention of a person or an agent shown as a chip. */
export function MessageBody({ body }: { body: string }) {
  return (
    <p className="text-sm whitespace-pre-wrap text-[var(--gray-12)]">
      {splitMentions(body).map((part, index) =>
        'mention' in part ? (
          <span key={index} className="rounded bg-[var(--accent-3)] px-1 font-medium text-[var(--accent-11)]">
            @{part.mention.name}
          </span>
        ) : (
          <span key={index}>{renderInline(part.text)}</span>
        )
      )}
    </p>
  )
}
