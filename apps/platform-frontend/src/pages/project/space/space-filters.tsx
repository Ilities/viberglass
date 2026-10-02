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

/** Search, and the filters people find tasks by: state, artifact, owner and whose move. Severity is tucked away. */
export function SpaceFilterBar({ filters, onChange, people }: SpaceFilterBarProps) {
  const [showMore, setShowMore] = useState(filters.severity !== 'all')
  const set = (patch: Partial<SpaceFilters>) => onChange({ ...filters, ...patch })

  return (
    <div className="mt-6 space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1.6fr)_repeat(4,minmax(8rem,0.7fr))_auto] lg:items-end">
        <Field label="Search">
          <SearchInput placeholder="Search tasks..." name="search" value={filters.search} onChange={(event) => set({ search: event.target.value })} />
        </Field>
        <Field label="State">
          <Select name="state" aria-label="State" value={filters.state} onChange={(value) => set({ state: isState(value) ? value : 'all' })}>
            <option value="all">Any state</option>
            {TASK_SITUATION_STATES.map((state) => (
              <option key={state} value={state}>
                {STATE_FILTER_LABEL[state]}
              </option>
            ))}
          </Select>
        </Field>
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
        <Button plain onClick={() => setShowMore(!showMore)}>
          {showMore ? 'Fewer filters' : 'More filters'}
        </Button>
      </div>
      {showMore && (
        <div className="grid gap-3 lg:grid-cols-5">
          <Field label="Severity">
            <Select name="severity" aria-label="Severity" value={filters.severity} onChange={(value) => set({ severity: isSeverity(value) ? value : 'all' })}>
              <option value="all">Any severity</option>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity[0].toUpperCase() + severity.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </div>
  )
}
