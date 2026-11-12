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
import { previewStatus, TryItButton } from './change-preview'
import type { AppPreview } from '@/service/api/build-api'

type BadgeColor = 'green' | 'red' | 'blue' | 'zinc'

/** The live state when the code host could be read, else the one Viberglass last recorded. */
function pullRequestState(pullRequest: BuildPullRequest, isChange: boolean): { label: string; color: BadgeColor } | null {
  const state = pullRequest.details?.state ?? pullRequest.recorded?.state
  if (!state) return null
  if (state === 'merged') return { label: isChange ? 'Made live' : 'Merged', color: 'green' }
  if (state === 'closed') return { label: 'Closed', color: 'red' }
  return pullRequest.details?.isDraft ? { label: 'Draft', color: 'zinc' } : { label: isChange ? 'Ready' : 'Open', color: 'blue' }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** In an App space the pull request is the task's change, which can be tried and made live from here. */
export interface ChangeActions {
  ticketId: string
  canMakeLive: boolean
  /** Try it is for everyone who may post on the task. */
  canTry: boolean
  onMadeLive: () => void
}

/** A change with its preview, as the panel shows it. */
export interface ChangeView extends ChangeActions {
  preview: AppPreview | null
  onPreviewChanged: (preview: AppPreview) => void
}

function changeMessage(tried: boolean, change: ChangeView): string {
  if (!tried) {
    return change.canMakeLive
      ? "Try the change first: it runs in a preview with a copy of the app's data, and nothing done there reaches the app. Then you can make it live."
      : "Try the change in a preview, with a copy of the app's data. Nothing done there reaches the app."
  }
  return change.canMakeLive
    ? 'When the change looks right, make it live for everyone who uses the app.'
    : "The task's owner or one of the space's maintainers can make it live."
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-[var(--gray-9)]">{children}</span>
}

/** Open review comments when GitHub could be read; otherwise why not, or when Viberglass last checked. */
function ReviewFact({ pullRequest }: { pullRequest: BuildPullRequest | null }) {
  if (pullRequest === null) return <Fact label="Review"><Missing>Reading…</Missing></Fact>
  if (pullRequest.unavailableReason) return <Fact label="Review"><Missing>{pullRequest.unavailableReason}</Missing></Fact>
  if (!pullRequest.details) {
    return pullRequest.recorded ? (
      <Fact label="Last checked"><Timestamp date={pullRequest.recorded.checkedAt} /></Fact>
    ) : (
      <Fact label="Review"><Missing>Not available</Missing></Fact>
    )
  }
  const count = pullRequest.comments.length
  return <Fact label="Review">{count > 0 ? plural(count, 'open comment') : <Missing>No open comments</Missing>}</Fact>
}

/**
 * A pull request as GitHub has it now, and what reviewers still want changed;
 * with `builds`, also the builds that went into it. `pullRequest` is null
 * while it's being read. When GitHub can't be read, it shows what Viberglass
 * recorded when it last checked.
 */
export function BuildPullRequestPanel({
  pullRequestUrl,
  pullRequest,
  builds,
  change,
}: {
  pullRequestUrl: string
  pullRequest: (BuildPullRequest & { branch?: string }) | null
  builds?: JobListItem[]
  change?: ChangeView
}) {
  const latestBuild = builds?.[0]
  const details = pullRequest?.details ?? null
  const recorded = details ? null : (pullRequest?.recorded ?? null)
  const branch = details?.headBranch ?? pullRequest?.branch ?? null
  const closedAt = recorded?.state === 'merged' ? recorded.mergedAt : recorded?.state === 'closed' ? recorded.closedAt : null
  const state = pullRequest ? pullRequestState(pullRequest, Boolean(change)) : null
  const comments = pullRequest?.comments ?? []
  const headSha = details?.state === 'open' && !details.isDraft ? details.headSha : null
  const tried = Boolean(headSha && change?.preview?.triedCommitSha === headSha)
  const canMakeLiveNow = Boolean(change?.canMakeLive && tried)

  return (
    <div className="@container space-y-8 py-4">
      {change && headSha && (change.canTry || change.canMakeLive) && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-[var(--gray-2)] px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-[var(--gray-11)]">{changeMessage(tried, change)}</p>
          <div className="flex shrink-0 gap-3">
            {change.canTry && (
              <TryItButton
                ticketId={change.ticketId}
                pullRequestUrl={pullRequestUrl}
                headSha={headSha}
                preview={change.preview}
                primary={!canMakeLiveNow}
                onChanged={change.onPreviewChanged}
              />
            )}
            {canMakeLiveNow && (
              <MakeLiveButton ticketId={change.ticketId} pullRequestUrl={pullRequestUrl} headSha={headSha} onMadeLive={change.onMadeLive} />
            )}
          </div>
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
          {change && (details?.state === 'open' || change.preview) && (
            <Fact label="Preview">
              {previewStatus(change.preview, headSha)}
              {change.preview?.state === 'failed' && change.preview.statusMessage && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[var(--gray-11)]">{change.preview.statusMessage}</pre>
              )}
              {change.preview?.power === 'off' && change.preview.statusMessage && (
                <span className="block text-[var(--gray-10)]">{change.preview.statusMessage}</span>
              )}
            </Fact>
          )}
          {!change && details?.previewUrl && (
            <Fact label="Preview">
              <a href={details.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
                Open the preview
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </Fact>
          )}
          {details?.title && <Fact label="Title">{details.title}</Fact>}
          <Fact label="State">
            {state ? (
              <>
                <Badge color={state.color}>{state.label}</Badge>
                {closedAt && <span className="text-[var(--gray-9)]"> · <Timestamp date={closedAt} /></span>}
              </>
            ) : (
              <Missing>{!pullRequest ? 'Reading…' : details ? 'Unknown' : 'Not checked yet'}</Missing>
            )}
          </Fact>
          {recorded?.mergedBy && <Fact label={change ? 'Made live by' : 'Merged by'}>{recorded.mergedBy}</Fact>}
          {branch && (
            <Fact label="Branch">
              <span className="font-mono text-[13px]">
                {branch}
                {details?.baseBranch && <span className="text-[var(--gray-9)]"> → {details.baseBranch}</span>}
              </span>
            </Fact>
          )}
          {details && (
            <Fact label="Changes">
              {details.additions !== null && details.deletions !== null ? (
                <span className="tabular-nums">
                  <span className="text-green-700 dark:text-green-400">+{details.additions}</span>{' '}
                  <span className="text-red-700 dark:text-red-400">−{details.deletions}</span>
                  {details.changedFiles !== null && <span className="text-[var(--gray-9)]"> in {plural(details.changedFiles, 'file')}</span>}
                </span>
              ) : (
                <Missing>Unknown</Missing>
              )}
            </Fact>
          )}
          {details && <Fact label="Commits">{details.commitCount ?? <Missing>Unknown</Missing>}</Fact>}
          {recorded?.commentCount !== null && recorded?.commentCount !== undefined && (
            <Fact label="Comments">
              {plural(recorded.commentCount, 'comment')}
              {recorded.reviewCommentCount ? `, ${recorded.reviewCommentCount} on the code` : ''}
            </Fact>
          )}
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
          <ReviewFact pullRequest={pullRequest} />
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
