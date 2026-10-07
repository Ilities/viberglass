import { Button } from '@/components/button'
import { Description, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { getProjectBySlug, updateProject, type UpdateProjectRequest } from '@/service/api/project-api'
import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import type { Project } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DefaultAgentField, WORKSPACE_DEFAULT_AGENT } from './DefaultAgentField'

// Select options can't have an empty value.
const CREATOR_OWNS = 'creator'
const QUESTION_REMINDER_HOURS = [1, 2, 4, 8, 24, 48]

function reminderLabel(hours: number): string {
  if (hours === 1) return 'After an hour'
  if (hours < 24) return `After ${hours} hours`
  return `After ${hours / 24} day${hours === 24 ? '' : 's'}`
}

/** What a new task in the space starts with: its agent, owner and reviewers, and when unanswered questions are chased. */
export function SpaceTaskDefaultsPage() {
  const { project: slug = '' } = useParams<{ project: string }>()
  const [project, setProject] = useState<Project | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getProjectBySlug(slug)
      .then(async (loaded) => {
        setProject(loaded)
        setPeople(await getPeopleDirectory())
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load the space'))
  }, [slug])

  if (!project) return error ? <Text>{error}</Text> : <Text>Loading…</Text>
  const canMaintain = project.viewerAccess?.canMaintain ?? false

  async function save(updates: UpdateProjectRequest) {
    if (!project) return
    setBusy(true)
    setError(null)
    try {
      setProject({ ...(await updateProject(project.id, updates)), viewerAccess: project.viewerAccess })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageMeta title={`${project.name} | Task defaults`} />
      <Heading>Task defaults</Heading>
      <div className="mt-8 space-y-8">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <DefaultAgentField
          value={project.defaultAgentId ?? WORKSPACE_DEFAULT_AGENT}
          disabled={!canMaintain || busy}
          onChange={(agentId) => void save({ defaultAgentId: agentId === WORKSPACE_DEFAULT_AGENT ? null : agentId })}
        />

        <div className="max-w-sm">
          <Label>Default owner</Label>
          <Select
            aria-label="Default owner"
            value={project.defaultOwnerId ?? CREATOR_OWNS}
            disabled={!canMaintain || busy}
            onChange={(userId) => void save({ defaultOwnerId: userId === CREATOR_OWNS ? null : userId })}
          >
            <option value={CREATOR_OWNS}>Whoever creates the task</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="max-w-sm">
          <Label>Default reviewers</Label>
          <Description>The agent mentions them when something is ready. With none, it mentions the owner.</Description>
          <ul className="mt-2 space-y-1">
            {project.defaultReviewerIds.map((reviewerId) => (
              <li key={reviewerId} className="flex items-center justify-between gap-2 text-sm">
                {people.find((person) => person.id === reviewerId)?.name ?? 'Someone who left'}
                {canMaintain && (
                  <Button
                    plain
                    disabled={busy}
                    onClick={() =>
                      void save({ defaultReviewerIds: project.defaultReviewerIds.filter((id) => id !== reviewerId) })
                    }
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {canMaintain && (
            <Select
              aria-label="Add a default reviewer"
              value=""
              placeholder="Add a reviewer…"
              disabled={busy}
              onChange={(userId) =>
                userId && void save({ defaultReviewerIds: [...project.defaultReviewerIds, userId] })
              }
            >
              {people
                .filter((person) => !project.defaultReviewerIds.includes(person.id))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </Select>
          )}
        </div>

        <div className="max-w-sm">
          <Label>Unanswered questions</Label>
          <Description>Remind whoever was asked, then the owner after as long again.</Description>
          <Select
            aria-label="Remind about unanswered questions after"
            value={String(project.questionReminderHours)}
            disabled={!canMaintain || busy}
            onChange={(hours) => void save({ questionReminderHours: Number(hours) })}
          >
            {QUESTION_REMINDER_HOURS.map((hours) => (
              <option key={hours} value={String(hours)}>
                {reminderLabel(hours)}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </>
  )
}
