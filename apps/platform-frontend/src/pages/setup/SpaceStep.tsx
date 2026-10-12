import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Text } from '@/components/text'
import { createSpace, prepareDefaultAgent } from '@/service/api/setup-api'
import { FILES_RUNS_UNAVAILABLE, type CreatedSpace, type DefaultAgent, type RepositoryAccess, type SetupModelChoice } from '@viberglass/types'
import { CheckIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { SetupError, SetupFrame } from './SetupFrame'

export function SpaceStep({
  repository,
  model,
  onDone,
  onChangeRepository,
}: {
  repository: RepositoryAccess | null
  model: SetupModelChoice
  onDone: (space: CreatedSpace, agent: DefaultAgent | null) => void
  onChangeRepository: () => void
}) {
  const [name, setName] = useState(repository?.fullName.split('/').pop() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsCreating(true)
    try {
      // Both steps are safe to repeat, so a retry after a failure picks up where this stopped.
      const space = await createSpace(repository
        ? { name, backingKind: 'git', repository: repository.url, baseBranch: repository.defaultBranch }
        : { name, backingKind: 'files' })
      const agent = repository ? await prepareDefaultAgent(model) : null
      onDone(space, agent)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the space.")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <SetupFrame
      files={repository === null}
      step={3}
      title="Name your first space"
      intro="A space holds the tasks for one product or repository. Everything else starts with sensible defaults."
    >
      <form onSubmit={handleSubmit} className="grid gap-6">
        {repository ? <div className="flex items-start gap-2 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <CheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Can read and push to {repository.fullName} · default branch {repository.defaultBranch}.{' '}
            <button type="button" className="underline" onClick={onChangeRepository}>
              Use another repository
            </button>
          </span>
        </div> : <Text>Files space · no repository needed. {FILES_RUNS_UNAVAILABLE}</Text>}
        <SetupError message={error} />
        <Field>
          <Label>Space name</Label>
          <Input name="name" value={name} onChange={(event) => setName(event.target.value)} />
          <Description>You can rename it later.</Description>
        </Field>
        <div className="flex gap-3">
          <Button type="button" outline onClick={onChangeRepository} disabled={isCreating}>Back</Button>
          <Button type="submit" color="brand" disabled={isCreating || !name.trim()}>
            {isCreating ? 'Creating the space…' : 'Create space'}
          </Button>
        </div>
        {repository && <Text>
          Agents write a plan and then open a pull request against {repository.defaultBranch}. Each step waits for
          your review.
        </Text>}
      </form>
    </SetupFrame>
  )
}
