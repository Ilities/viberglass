import { Button } from '@/components/button'
import { SearchInput } from '@/components/search-input'
import { Select } from '@/components/select'
import { TASK_SITUATION_STATES, TICKET_WORKFLOW_PHASE, type Severity, type TaskSituationState, type TicketWorkflowPhase } from '@viberglass/types'
import { useState } from 'react'
import { STATE_FILTER_LABEL, type SituationFilters } from './space-groups'

export interface SpaceFilters extends SituationFilters {
  search: string
  artifact: TicketWorkflowPhase | 'all'
  severity: Severity | 'all'
}

const ARTIFACT_LABEL: Record<TicketWorkflowPhase, string> = {
  [TICKET_WORKFLOW_PHASE.RESEARCH]: 'Research',
  [TICKET_WORKFLOW_PHASE.PLANNING]: 'Plan',
  [TICKET_WORKFLOW_PHASE.EXECUTION]: 'Code',
}
const ARTIFACTS = Object.values(TICKET_WORKFLOW_PHASE)
const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']

const isState = (value: string | null): value is TaskSituationState => TASK_SITUATION_STATES.some((state) => state === value)
const isArtifact = (value: string | null): value is TicketWorkflowPhase => ARTIFACTS.some((artifact) => artifact === value)
const isSeverity = (value: string | null): value is Severity => SEVERITIES.some((severity) => severity === value)

export function readFilters(params: URLSearchParams): SpaceFilters {
  const state = params.get('state')
  const artifact = params.get('artifact')
  const severity = params.get('severity')
  return {
    search: params.get('search') ?? '',
    state: isState(state) ? state : 'all',
    artifact: isArtifact(artifact) ? artifact : 'all',
    severity: isSeverity(severity) ? severity : 'all',
    ownerId: params.get('owner') ?? 'all',
    waitingOn: params.get('waitingOn') ?? 'all',
  }
}

/** Writes the filters into the page's other params, leaving out the defaults. */
export function writeFilters(params: URLSearchParams, filters: SpaceFilters): URLSearchParams {
  const next = new URLSearchParams(params)
  const values: Record<string, string> = {
    search: filters.search.trim(),
    state: filters.state,
    artifact: filters.artifact,
    severity: filters.severity,
    owner: filters.ownerId,
    waitingOn: filters.waitingOn,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
  }
  return next
}

interface SpaceFilterBarProps {
  filters: SpaceFilters
  onChange: (filters: SpaceFilters) => void
  people: { owners: Array<{ id: string; name: string }>; waitedOn: Array<{ id: string; name: string }> }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  )
}

const SEVERITY_LABEL = (severity: Severity) => severity[0].toUpperCase() + severity.slice(1)

/** The filters set away from their defaults, each with a label and how to clear it. */
interface ActiveFilter {
  key: string
  label: string
  clear: Partial<SpaceFilters>
}

function activeFilters(filters: SpaceFilters, people: SpaceFilterBarProps['people']): ActiveFilter[] {
  const name = (list: Array<{ id: string; name: string }>, id: string) => list.find((person) => person.id === id)?.name ?? 'someone'
  const entries: Array<ActiveFilter | null> = [
    filters.search.trim() ? { key: 'search', label: `“${filters.search.trim()}”`, clear: { search: '' } } : null,
    filters.state !== 'all' ? { key: 'state', label: STATE_FILTER_LABEL[filters.state], clear: { state: 'all' } } : null,
    filters.artifact !== 'all' ? { key: 'artifact', label: ARTIFACT_LABEL[filters.artifact], clear: { artifact: 'all' } } : null,
    filters.ownerId !== 'all' ? { key: 'owner', label: `Owned by ${name(people.owners, filters.ownerId)}`, clear: { ownerId: 'all' } } : null,
    filters.waitingOn !== 'all'
      ? { key: 'waitingOn', label: `Waiting on ${filters.waitingOn === 'agent' ? 'the agent' : name(people.waitedOn, filters.waitingOn)}`, clear: { waitingOn: 'all' } }
      : null,
    filters.severity !== 'all' ? { key: 'severity', label: `${SEVERITY_LABEL(filters.severity)} severity`, clear: { severity: 'all' } } : null,
  ]
  return entries.flatMap((entry) => (entry ? [entry] : []))
}

/**
 * Search and state up front; artifact, owner, whose move and severity behind
 * More filters. Whatever is set shows as a chip that clears it, so a hidden
 * filter is never forgotten.
 */
export function SpaceFilterBar({ filters, onChange, people }: SpaceFilterBarProps) {
  const hiddenSet = filters.artifact !== 'all' || filters.ownerId !== 'all' || filters.waitingOn !== 'all' || filters.severity !== 'all'
  const [showMore, setShowMore] = useState(hiddenSet)
  const set = (patch: Partial<SpaceFilters>) => onChange({ ...filters, ...patch })
  const active = activeFilters(filters, people)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[16rem] flex-1">
          <SearchInput
            placeholder="Search tasks"
            aria-label="Search tasks"
            name="search"
            value={filters.search}
            onChange={(event) => set({ search: event.target.value })}
          />
        </div>
        <div className="w-48">
          <Select name="state" aria-label="State" value={filters.state} onChange={(value) => set({ state: isState(value) ? value : 'all' })}>
            <option value="all">All situations</option>
            {TASK_SITUATION_STATES.map((state) => (
              <option key={state} value={state}>
                {STATE_FILTER_LABEL[state]}
              </option>
            ))}
          </Select>
        </div>
        <Button outline aria-expanded={showMore} onClick={() => setShowMore(!showMore)}>
          {showMore ? 'Fewer filters' : 'More filters'}
        </Button>
      </div>
      {showMore && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Artifact">
            <Select name="artifact" aria-label="Artifact" value={filters.artifact} onChange={(value) => set({ artifact: isArtifact(value) ? value : 'all' })}>
              <option value="all">Any artifact</option>
              {ARTIFACTS.map((artifact) => (
                <option key={artifact} value={artifact}>
                  {ARTIFACT_LABEL[artifact]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner">
            <Select name="owner" aria-label="Owner" value={filters.ownerId} onChange={(value) => set({ ownerId: value })}>
              <option value="all">Anyone</option>
              {people.owners.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Waiting on">
            <Select name="waitingOn" aria-label="Waiting on" value={filters.waitingOn} onChange={(value) => set({ waitingOn: value })}>
              <option value="all">Anyone</option>
              <option value="agent">The agent</option>
              {people.waitedOn.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Severity">
            <Select name="severity" aria-label="Severity" value={filters.severity} onChange={(value) => set({ severity: isSeverity(value) ? value : 'all' })}>
              <option value="all">Any severity</option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {SEVERITY_LABEL(severity)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {active.length > 0 && (
        <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
          {active.map((filter) => (
            <li key={filter.key}>
              <button
                type="button"
                onClick={() => set(filter.clear)}
                aria-label={`Clear filter: ${filter.label}`}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--gray-6)] bg-[var(--gray-2)] px-2.5 py-0.5 text-xs text-[var(--gray-12)] hover:bg-[var(--gray-4)]"
              >
                {filter.label}
                <span aria-hidden>×</span>
              </button>
            </li>
          ))}
          {active.length > 1 && (
            <li>
              <Button plain className="text-xs" onClick={() => set(active.reduce<Partial<SpaceFilters>>((cleared, filter) => ({ ...cleared, ...filter.clear }), {}))}>
                Clear all
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
