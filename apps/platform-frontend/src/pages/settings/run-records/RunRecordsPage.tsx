import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { Timestamp } from '@/components/timestamp'
import { formatJobKind, jobKindBadgeColor } from '@/data'
import { listRunRecords, type RunRecord } from '@/service/api/run-record-api'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  formatAgentName,
  formatHarness,
  formatPullRequestState,
  formatRunCost,
  formatRunResult,
  formatTokenSummary,
  runRecordHref,
} from './run-record-format'

/**
 * Every run's record across spaces, newest first: what the eval corpus holds,
 * one run at a time. Aggregates wait for task-level grouping and stored grades.
 */
export function RunRecordsPage() {
  const [records, setRecords] = useState<RunRecord[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    listRunRecords()
      .then((page) => {
        setRecords(page.records)
        setNextCursor(page.nextCursor)
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to load run records'))
      .finally(() => setLoading(false))
  }, [])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const page = await listRunRecords(nextCursor)
      setRecords((current) => [...current, ...page.records])
      setNextCursor(page.nextCursor)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load run records')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <>
      <PageMeta title="Run records" />
      <Heading>Run records</Heading>
      <Text className="mt-2 max-w-2xl">
        What each run recorded for evaluation: the agent, whether it succeeded, what happened to its pull request, and
        what it cost. Costs marked as an estimate are the agent's fixed per-run figure, not a measurement.
      </Text>

      {loading ? (
        <div className="mt-8 text-center text-sm text-zinc-500">Loading…</div>
      ) : records.length === 0 ? (
        <div className="mt-8 text-center text-sm text-zinc-500">No runs recorded yet.</div>
      ) : (
        <>
          <Table className="mt-6 [--gutter:--spacing(6)]">
            <TableHead>
              <TableRow>
                <TableHeader>Run</TableHeader>
                <TableHeader>Agent</TableHeader>
                <TableHeader>Result</TableHeader>
                <TableHeader>Pull request</TableHeader>
                <TableHeader>Cost and tokens</TableHeader>
                <TableHeader>Dispatched</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <RunRecordRow key={record.jobId} record={record} />
              ))}
            </TableBody>
          </Table>
          {nextCursor && (
            <div className="mt-6 flex justify-center">
              <Button outline onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load older runs'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}

function RunRecordRow({ record }: { record: RunRecord }) {
  const href = runRecordHref(record)
  const result = formatRunResult(record)
  const pullRequest = formatPullRequestState(record)
  const cost = formatRunCost(record)
  const tokens = formatTokenSummary(record)
  const title = record.ticketTitle ?? formatJobKind(record.jobKind)

  return (
    <TableRow href={href ?? undefined}>
      <TableCell className="max-w-72">
        <div className="flex items-center gap-2">
          <Badge color={jobKindBadgeColor(record.jobKind)}>{formatJobKind(record.jobKind)}</Badge>
          <span className="truncate text-sm font-medium text-[var(--gray-12)]" title={title}>
            {title}
          </span>
        </div>
        {record.projectSlug && <div className="mt-0.5 text-xs text-[var(--gray-9)]">{record.projectSlug}</div>}
      </TableCell>
      <TableCell className="text-sm text-[var(--gray-11)]">
        {formatAgentName(record) ?? '—'}
        <div className="text-xs text-[var(--gray-9)]">
          {[formatHarness(record), record.modelSnapshot ?? 'model not reported'].filter(Boolean).join(' · ')}
        </div>
      </TableCell>
      <TableCell>
        <Badge color={result.color}>{result.label}</Badge>
      </TableCell>
      <TableCell>{pullRequest ? <Badge color={pullRequest.color}>{pullRequest.label}</Badge> : <Dash />}</TableCell>
      <TableCell className="text-sm tabular-nums">
        {cost.amount ? (
          <>
            <span className="text-[var(--gray-12)]">{cost.amount}</span>{' '}
            <span className="text-xs text-[var(--gray-9)]">{cost.provenance}</span>
          </>
        ) : (
          <span className="text-xs text-[var(--gray-9)]">{cost.provenance}</span>
        )}
        <div className="text-xs text-[var(--gray-9)]">{tokens ?? 'tokens not reported'}</div>
      </TableCell>
      <TableCell className="text-sm text-[var(--gray-10)]">
        <Timestamp date={record.dispatchedAt} />
      </TableCell>
    </TableRow>
  )
}

function Dash() {
  return <span className="text-[var(--gray-8)]">—</span>
}
