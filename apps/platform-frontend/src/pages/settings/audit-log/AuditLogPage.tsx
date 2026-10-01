import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { usePersonName } from '@/hooks/usePeople'
import { listAuditLog } from '@/service/api/audit-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { AUDIT_TARGET_TYPES, isAuditTargetType, type AuditEntry, type AuditTargetType } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AREA_LABEL, auditDetails, auditSentence } from './audit-entry-text'

// Select options can't have an empty value.
const EVERYONE = 'everyone'
const ALL_AREAS = 'all'

/** Who changed what across the workspace (J17), for admins, newest first. */
export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState<Person[]>([])
  const [actorId, setActorId] = useState(EVERYONE)
  const [area, setArea] = useState<AuditTargetType | typeof ALL_AREAS>(ALL_AREAS)
  const personName = usePersonName()

  const load = useCallback(
    async (before?: string) => {
      setLoading(true)
      try {
        const page = await listAuditLog({
          actorId: actorId === EVERYONE ? undefined : actorId,
          area: area === ALL_AREAS ? undefined : area,
          before,
        })
        setEntries((current) => (before ? [...current, ...page.entries] : page.entries))
        setHasMore(page.hasMore)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load the audit log')
      } finally {
        setLoading(false)
      }
    },
    [actorId, area]
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    getPeopleDirectory()
      .then(setPeople)
      .catch(() => setPeople([]))
  }, [])

  return (
    <>
      <PageMeta title="Audit log" />
      <Heading>Audit log</Heading>
      <Text className="mt-2 max-w-2xl">
        Who started and cancelled runs, approved steps, and changed connections, secrets, agents, members, invites and
        spaces. A task&apos;s own Activity has the rest of what happened on it.
      </Text>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="w-56">
          <Select aria-label="Person" value={actorId} onChange={setActorId}>
            <option value={EVERYONE}>Everyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select aria-label="Area" value={area} onChange={(value) => setArea(isAuditTargetType(value) ? value : ALL_AREAS)}>
            <option value={ALL_AREAS}>All areas</option>
            {AUDIT_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {AREA_LABEL[type]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="mt-8 text-center text-sm text-zinc-500">{loading ? 'Loading…' : 'Nothing recorded yet.'}</div>
      ) : (
        <>
          <Table className="mt-6 [--gutter:--spacing(6)]">
            <TableHead>
              <TableRow>
                <TableHeader>When</TableHeader>
                <TableHeader>What happened</TableHeader>
                <TableHeader>Area</TableHeader>
                <TableHeader>From</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => {
                const facts = auditDetails(entry, (id) => personName(id) ?? 'someone')
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-zinc-500">{new Date(entry.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {auditSentence(entry)}
                      {facts.length > 0 && <span className="block text-xs text-zinc-500">{facts.join(' · ')}</span>}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {AREA_LABEL[entry.targetType]}
                      {entry.targetId && <span className="block font-mono text-xs">{entry.targetId.slice(0, 12)}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-500">{entry.ip ?? '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {hasMore && (
            <div className="mt-6 text-center">
              <Button outline disabled={loading} onClick={() => void load(entries[entries.length - 1]?.createdAt)}>
                {loading ? 'Loading…' : 'Show older'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
