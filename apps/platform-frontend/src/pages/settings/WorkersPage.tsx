import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { getWorkerLimit, saveWorkerLimit } from '@/service/api/worker-limit-api'
import type { WorkerCapacityStatus } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

/** How many Kubernetes workers may run at once. */
export function WorkersPage() {
  const [status, setStatus] = useState<WorkerCapacityStatus | null>(null)
  const [maxRuns, setMaxRuns] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    getWorkerLimit()
      .then((loaded) => {
        setStatus(loaded)
        setMaxRuns(loaded.maxRuns === null ? '' : String(loaded.maxRuns))
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't load the worker limit"))
  }, [])

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    try {
      setStatus(await saveWorkerLimit(maxRuns.trim() === '' ? null : Number(maxRuns)))
      toast.success('Worker limit saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the worker limit")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <PageMeta title="Workers" />
      <div className="max-w-2xl py-6">
        <Heading>Workers</Heading>
        <Text className="!mt-2">
          Agents on Kubernetes each run in a worker Pod. Limit how many run at once to what your nodes can hold; runs
          over the limit wait for one to finish, people’s runs ahead of scheduled runs and app builds.
        </Text>

        {status && (
          <Text className="!mt-4">
            {status.running} running{status.maxRuns !== null && ` of ${status.maxRuns}`}, {status.waiting} waiting.
          </Text>
        )}

        <form className="mt-10" onSubmit={handleSave}>
          <Fieldset disabled={isSaving || !status}>
            <FieldGroup className="space-y-6">
              <Field>
                <Label>Workers at once</Label>
                <Description>Empty means no limit.</Description>
                <Input
                  name="maxRuns"
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  value={maxRuns}
                  onChange={(event) => setMaxRuns(event.target.value)}
                />
              </Field>
              <div className="flex justify-end border-t border-zinc-950/10 pt-6 dark:border-white/10">
                <Button type="submit" color="brand">{isSaving ? 'Saving…' : 'Save'}</Button>
              </div>
            </FieldGroup>
          </Fieldset>
        </form>
      </div>
    </>
  )
}
