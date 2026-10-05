import { Badge } from '@/components/badge'
import { Fact, FactList } from '@/components/fact-list'
import { getRunRecord, type RunRecord } from '@/service/api/run-record-api'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link } from '@/components/link'
import {
  formatAgentName,
  formatHarness,
  formatPullRequestState,
  formatRunCost,
  formatRunResult,
} from '../../settings/run-records/run-record-format'
import { formatRunDuration } from './run-facts'

/** What this run recorded: outcome, model, tokens and cost. The record is written as the run is dispatched and finishes. */
export function RunRecordPanel({ jobId }: { jobId: string }) {
  const [record, setRecord] = useState<RunRecord | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRecord(undefined)
    setError(null)
    getRunRecord(jobId)
      .then(setRecord)
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Failed to load run record'))
  }, [jobId])

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
  if (record === undefined) return <p className="text-sm text-[var(--gray-9)]">Loading record…</p>
  if (record === null) {
    return <p className="text-sm text-[var(--gray-9)]">This run has no record. Runs dispatched before records existed only have one if they opened a pull request.</p>
  }
  return <RunRecordFacts record={record} />
}

function RunRecordFacts({ record }: { record: RunRecord }) {
  const result = formatRunResult(record)
  const pullRequestState = formatPullRequestState(record)
  const cost = formatRunCost(record)
  const usage = record.usageAvailable ? record.usage : null

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <FactList title="Outcome">
        <Fact label="Result">
          <Badge color={result.color}>{result.label}</Badge>
          {record.stopReason && <span className="text-[var(--gray-9)]"> · {record.stopReason}</span>}
        </Fact>
        {record.errorMessage && <Fact label="Error">{record.errorMessage}</Fact>}
        <Fact label="Pull request">
          {record.pullRequest && pullRequestState ? (
            <>
              <a href={record.pullRequest.url} target="_blank" rel="noreferrer" className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
                {record.pullRequest.url.replace(/^https:\/\/github\.com\//, '')}
              </a>{' '}
              <Badge color={pullRequestState.color}>{pullRequestState.label}</Badge>
            </>
          ) : (
            <Missing>None opened</Missing>
          )}
        </Fact>
        {record.pullRequest?.state && record.pullRequest.state !== 'open' && (
          <Fact label="Comments">
            {record.pullRequest.commentCount ?? '—'} conversation · {record.pullRequest.reviewCommentCount ?? '—'} review
          </Fact>
        )}
        {record.pullRequest?.lastError && <Fact label="Last check">{record.pullRequest.lastError}</Fact>}
        {record.pullRequest?.checkedAt && <Fact label="Checked">{new Date(record.pullRequest.checkedAt).toLocaleString()}</Fact>}
        <Fact label="Files changed"><Value value={record.changedFileCount} /></Fact>
      </FactList>

      <FactList title="Cost and usage">
        <Fact label="Cost">
          {cost.amount ? <>{cost.amount} <span className="text-[var(--gray-9)]">{cost.provenance}</span></> : <Missing>Not measured</Missing>}
        </Fact>
        {usage ? (
          <>
            <Fact label="Input"><Tokens value={usage.inputTokens} /></Fact>
            <Fact label="Output"><Tokens value={usage.outputTokens} /></Fact>
            <Fact label="Reasoning"><Tokens value={usage.reasoningOutputTokens} /></Fact>
            <Fact label="Cache read"><Tokens value={usage.cacheReadInputTokens} /></Fact>
            <Fact label="Cache write"><Tokens value={usage.cacheCreationInputTokens} /></Fact>
          </>
        ) : (
          <Fact label="Tokens"><Missing>Not reported by the agent</Missing></Fact>
        )}
      </FactList>

      <FactList title="What ran">
        <Fact label="Agent">
          {record.clankerSlug && record.clankerName ? (
            <Link href={`/settings/agents/${record.clankerSlug}`} className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
              {record.clankerName}
            </Link>
          ) : (
            <Value value={formatAgentName(record)} />
          )}
        </Fact>
        <Fact label="Harness"><Value value={formatHarness(record)} /></Fact>
        <Fact label="Model"><Value value={record.modelSnapshot} /></Fact>
        <Fact label="Runner"><Value value={record.workerType} /></Fact>
        <Fact label="Image"><Mono value={record.computeImage} /></Fact>
        <Fact label="Base commit"><Mono value={record.baseSha?.slice(0, 12) ?? null} /></Fact>
        <Fact label="Result commit"><Mono value={record.commitSha?.slice(0, 12) ?? null} /></Fact>
      </FactList>

      <FactList title="Reproducibility">
        <Fact label="Config"><Mono value={record.configHash?.slice(0, 12) ?? null} /></Fact>
        <Fact label="Instructions"><Mono value={record.instructionsHash?.slice(0, 12) ?? null} /></Fact>
        <Fact label="Prompt">
          <Mono value={record.promptHash?.slice(0, 12) ?? null} />
          {record.promptCharacters !== null && <span className="text-[var(--gray-9)]"> · {record.promptCharacters.toLocaleString('en-US')} chars</span>}
        </Fact>
        <Fact label="Dispatched">{new Date(record.dispatchedAt).toLocaleString()}</Fact>
        <Fact label="Took"><Value value={formatRunDuration(record.startedAt, record.finishedAt)} /></Fact>
        <Fact label="Record">v{record.manifestVersion}</Fact>
      </FactList>
    </div>
  )
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-[var(--gray-9)]">{children}</span>
}

function Value({ value }: { value: string | number | null }) {
  return value === null ? <Missing>Not recorded</Missing> : <>{value}</>
}

function Mono({ value }: { value: string | null }) {
  return value === null ? <Missing>Not recorded</Missing> : <span className="font-mono text-[13px]">{value}</span>
}

function Tokens({ value }: { value: number | null }) {
  return value === null ? <Missing>Not reported</Missing> : <span className="tabular-nums">{value.toLocaleString('en-US')}</span>
}
