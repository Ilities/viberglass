import { getRunRecord, type RunRecord } from '@/service/api/run-record-api'
import { useEffect, useState } from 'react'
import { runFactsLine } from './run-facts-line'

/** What the turn's run used, loaded when someone opens the turn's details. */
export function TurnRunFacts({ jobId }: { jobId: string }) {
  const [record, setRecord] = useState<RunRecord | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getRunRecord(jobId)
      .then((loaded) => !cancelled && setRecord(loaded))
      .catch(() => !cancelled && setRecord(null))
    return () => {
      cancelled = true
    }
  }, [jobId])

  if (record === undefined) return <p>Loading what it used…</p>
  if (record === null) return <p>No usage was recorded for this run.</p>
  return <p className="text-[var(--gray-11)]">{runFactsLine(record).join(' · ')}</p>
}
