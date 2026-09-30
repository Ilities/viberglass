import type { PullRequestReviewComment } from '@/service/api/build-api'
import clsx from 'clsx'

const KIND_LABEL: Record<PullRequestReviewComment['kind'], string> = {
  thread: 'Open thread',
  review: 'Review',
  conversation: 'Comment',
}

/** Pull request review comments, each with who wrote it and where. */
export function ReviewCommentList({ comments, className }: { comments: PullRequestReviewComment[]; className?: string }) {
  return (
    <ul className={clsx('divide-y divide-[var(--gray-4)] rounded-lg border border-[var(--gray-5)]', className)}>
      {comments.map((comment, index) => (
        <li key={comment.url ?? index} className="px-3 py-2 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--gray-9)]">
            <span className="font-medium text-[var(--gray-11)]">{comment.author ?? 'Someone'}</span>
            <span>{KIND_LABEL[comment.kind]}</span>
            {comment.path && (
              <span className="font-mono">
                {comment.path}
                {comment.line !== null && `:${comment.line}`}
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[var(--gray-12)]">{comment.body}</p>
        </li>
      ))}
    </ul>
  )
}
