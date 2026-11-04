import { Badge } from '@/components/badge'
import { Fact, FactList } from '@/components/fact-list'
import { ReviewCommentList } from '@/components/review-comment-list'
import { Timestamp } from '@/components/timestamp'
import { formatJobStatus } from '@/data'
import type { BuildPullRequest } from '@/service/api/build-api'
import type { JobListItem } from '@/service/api/job-api'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import type { ReactNode } from 'react'
import { formatRunDuration } from '../jobs/run-facts'
import { addressPath } from '@/lib/repositoryAddress'
import { MakeLiveButton } from './make-live-button'

type BadgeColor = 'green' | 'red' | 'blue' | 'zinc'

function pullRequestState(pullRequest: BuildPullRequest, isChange: boolean): { label: string; color: BadgeColor } | null {
  const details = pullRequest.details
  if (!details?.state) return null
  if (details.state === 'merged') return { label: isChange ? 'Made live' : 'Merged', color: 'green' }
  if (details.state === 'closed') return { label: 'Closed', color: 'red' }
  return details.isDraft ? { label: 'Draft', color: 'zinc' } : { label: isChange ? 'Ready' : 'Open', color: 'blue' }
}

/** In an App space the pull request is the task's change, which can be made live from here. */
export interface ChangeActions {
  ticketId: string
  canMakeLive: boolean
  onMadeLive: () => void
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-[var(--gray-9)]">{children}</span>
}

/**
 * A pull request as GitHub has it now, and what reviewers still want changed;
 * with `builds`, also the builds that went into it. `pullRequest` is null
 * while it's being read.
 */
export function BuildPullRequestPanel({
  pullRequestUrl,
  pullRequest,
  builds,
  change,
}: {
  pullRequestUrl: string
  pullRequest: BuildPullRequest | null
  builds?: JobListItem[]
  change?: ChangeActions
}) {
  const latestBuild = builds?.[0]
  const details = pullRequest?.details ?? null
  const state = pullRequest ? pullRequestState(pullRequest, Boolean(change)) : null
  const comments = pullRequest?.comments ?? []
  const headSha = details?.state === 'open' && !details.isDraft ? details.headSha : null

  return (
    <div className="@container space-y-8 py-4">
      {change?.canMakeLive && headSha && (
        <div className="flex items-center justify-between gap-4 rounded-md bg-[var(--gray-2)] px-4 py-3">
          <p className="text-sm text-[var(--gray-11)]">When the change looks right, make it live for everyone who uses the app.</p>
          <MakeLiveButton ticketId={change.ticketId} pullRequestUrl={pullRequestUrl} headSha={headSha} onMadeLive={change.onMadeLive} />
        </div>
      )}
      <div className="grid gap-8 @min-[40rem]:grid-cols-2">
        <FactList title={change ? 'Change' : 'Pull request'}>
          <Fact label={change ? 'Code' : 'Link'}>
            <a href={pullRequestUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-1 text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
              <span className="min-w-0 break-all">{addressPath(pullRequestUrl)}</span>
              <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0" />
            </a>
          </Fact>
          {details?.previewUrl && (
            <Fact label="Preview">
              <a href={details.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
                Open the preview
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </Fact>
          )}
          {details?.title && <Fact label="Title">{details.title}</Fact>}
          <Fact label="State">
            {state ? <Badge color={state.color}>{state.label}</Badge> : <Missing>{pullRequest ? 'Unknown' : 'Reading…'}</Missing>}
          </Fact>
          <Fact label="Branch">
            {details?.headBranch ? (
              <span className="font-mono text-[13px]">
                {details.headBranch}
                {details.baseBranch && <span className="text-[var(--gray-9)]"> → {details.baseBranch}</span>}
              </span>
            ) : (
              <Missing>Unknown</Missing>
            )}
          </Fact>
          <Fact label="Changes">
            {details?.additions !== null && details?.additions !== undefined && details.deletions !== null ? (
              <span className="tabular-nums">
                <span className="text-green-700 dark:text-green-400">+{details.additions}</span>{' '}
                <span className="text-red-700 dark:text-red-400">−{details.deletions}</span>
                {details.changedFiles !== null && <span className="text-[var(--gray-9)]"> in {details.changedFiles} file{details.changedFiles === 1 ? '' : 's'}</span>}
              </span>
            ) : (
              <Missing>Unknown</Missing>
            )}
          </Fact>
          <Fact label="Commits">{details?.commitCount ?? <Missing>Unknown</Missing>}</Fact>
        </FactList>

        <FactList title={builds ? 'Builds' : 'Review'}>
          {builds && <Fact label="Builds">{builds.length}</Fact>}
          {latestBuild && (
            <>
              <Fact label="Last build">
                {formatJobStatus(latestBuild.status).label}
                <span className="text-[var(--gray-9)]"> · <Timestamp date={latestBuild.createdAt} /></span>
              </Fact>
              <Fact label="Took">{formatRunDuration(latestBuild.processedAt, latestBuild.finishedAt) ?? <Missing>Not started</Missing>}</Fact>
            </>
          )}
          <Fact label="Review">
            {pullRequest === null ? (
              <Missing>Reading…</Missing>
            ) : pullRequest.unavailableReason ? (
              <Missing>{pullRequest.unavailableReason}</Missing>
            ) : comments.length > 0 ? (
              `${comments.length} open comment${comments.length === 1 ? '' : 's'}`
            ) : (
              <Missing>No open comments</Missing>
            )}
          </Fact>
        </FactList>
      </div>

      {comments.length > 0 && (
        <FactList title="Open review comments">
          <div className="mt-2">
            <ReviewCommentList comments={comments} />
          </div>
        </FactList>
      )}
    </div>
  )
}
