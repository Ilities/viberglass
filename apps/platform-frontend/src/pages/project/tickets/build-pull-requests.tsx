import { Subheading } from '@/components/heading'
import { getBuildPullRequests, type TaskPullRequest } from '@/service/api/build-api'
import type { JobListItem } from '@/service/api/job-api'
import { useEffect, useState } from 'react'
import { BuildPullRequestPanel, type ChangeActions, type ChangeView } from './build-pull-request-panel'
import { useChangePreviews } from './change-preview'

/** "Part 2", "Parts 2–3", "Parts 2 to the end", or "The whole plan": what a pull request builds. */
export function partsLabel(pullRequest: Pick<TaskPullRequest, 'firstPart' | 'lastPart'>): string {
  const { firstPart, lastPart } = pullRequest
  if (lastPart === null) return firstPart === 1 ? 'The whole plan' : `Parts ${firstPart} to the end`
  return firstPart === lastPart ? `Part ${firstPart}` : `Parts ${firstPart}–${lastPart}`
}

/**
 * The task's pull requests, oldest first. The builds go into the latest, so
 * it's the one that shows them; a task with one pull request shows just it.
 */
export function BuildPullRequests({
  ticketId,
  latestUrl,
  runs,
  change,
}: {
  ticketId: string
  latestUrl: string
  runs: JobListItem[]
  change?: ChangeActions
}) {
  const [pullRequests, setPullRequests] = useState<TaskPullRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A change made live is merged now; read it again so it stops offering to.
  const [madeLive, setMadeLive] = useState(0)
  const { previews, changed } = useChangePreviews(ticketId, Boolean(change))
  const changeFor = (pullRequestUrl: string): ChangeView | undefined =>
    change && {
      ...change,
      onMadeLive: () => {
        setMadeLive((count) => count + 1)
        change.onMadeLive()
      },
      preview: previews.find((preview) => preview.pullRequestUrl === pullRequestUrl) ?? null,
      onPreviewChanged: changed,
    }
  const builds = runs.filter((run) => run.jobKind === 'execution')
  const latestBuild = builds[0]
  // Reload when a new build appears or the latest one finishes.
  const buildKey = latestBuild ? `${latestBuild.jobId}:${latestBuild.status}` : 'none'

  useEffect(() => {
    getBuildPullRequests(ticketId)
      .then((listed) => {
        setPullRequests(listed)
        setError(null)
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Failed to read the pull requests'))
  }, [ticketId, latestUrl, buildKey, madeLive])

  if (!pullRequests || pullRequests.length === 0) {
    const reading = error ? { pullRequestUrl: latestUrl, details: null, comments: [], unavailableReason: error } : null
    return <BuildPullRequestPanel pullRequestUrl={latestUrl} pullRequest={reading} builds={builds} change={changeFor(latestUrl)} />
  }
  if (pullRequests.length === 1) {
    const [only] = pullRequests
    return <BuildPullRequestPanel pullRequestUrl={only.pullRequestUrl} pullRequest={only} builds={builds} change={changeFor(only.pullRequestUrl)} />
  }
  return (
    <div className="divide-y divide-[var(--gray-5)]">
      {pullRequests.map((pullRequest, index) => (
        <section key={pullRequest.pullRequestUrl} aria-label={partsLabel(pullRequest)} className="pt-4 first:pt-0">
          <Subheading level={3}>{partsLabel(pullRequest)}</Subheading>
          <BuildPullRequestPanel
            pullRequestUrl={pullRequest.pullRequestUrl}
            pullRequest={pullRequest}
            builds={index === pullRequests.length - 1 ? builds : undefined}
            change={changeFor(pullRequest.pullRequestUrl)}
          />
        </section>
      ))}
    </div>
  )
}
