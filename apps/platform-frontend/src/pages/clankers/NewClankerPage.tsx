import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { createClanker } from '@/service/api/clanker-api'
import { useNavigate } from 'react-router-dom'
import { RunnerForm } from './runner-form/RunnerForm'

export function NewClankerPage() {
  const navigate = useNavigate()

  return (
    <>
      <PageMeta title="New agent runner" />
      <Heading>Create agent runner</Heading>
      <Subheading className="mt-2">Configure a new agent worker for your Viberglass tasks.</Subheading>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        Creating an agent runner stores its settings only. Use the Start action on the runner page when you are ready to
        provision it.
      </div>
      <RunnerForm
        submitLabel="Create agent runner"
        submittingLabel="Creating..."
        onSubmit={async (request) => {
          const clanker = await createClanker(request)
          navigate(`/settings/agents/${clanker.slug}`)
        }}
        onCancel={() => navigate(-1)}
      />
    </>
  )
}
