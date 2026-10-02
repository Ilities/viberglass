import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { getClankerBySlug } from '@/data'
import { updateClanker } from '@/service/api/clanker-api'
import type { Clanker } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RunnerForm } from './runner-form/RunnerForm'

export function EditClankerPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [clanker, setClanker] = useState<Clanker | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    getClankerBySlug(slug)
      .then(setClanker)
      .finally(() => setIsLoading(false))
  }, [slug])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!clanker) {
    return null
  }

  return (
    <>
      <PageMeta title={`Edit ${clanker.name}`} />
      <Heading>Edit agent runner</Heading>
      <Subheading className="mt-2">Update the configuration for {clanker.name}.</Subheading>
      <RunnerForm
        initial={clanker}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
        onSubmit={async (request) => {
          const updated = await updateClanker(clanker.id, request)
          navigate(`/settings/agents/${updated.slug}`)
        }}
        onCancel={() => navigate(-1)}
      />
    </>
  )
}
