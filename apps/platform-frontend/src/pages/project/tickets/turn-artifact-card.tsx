import { Button } from '@/components/button'
import { artifactPath, formatLabel } from '@/lib/artifacts'
import { downloadArtifactVersion } from '@/service/api/artifact-api'
import { ReaderIcon } from '@radix-ui/react-icons'
import type { TurnArtifact } from '@viberglass/types'
import { toast } from 'sonner'

/** An artifact version a turn produced, with the ways to look at it. */
export function TurnArtifactCard({ artifact, space }: { artifact: TurnArtifact; space: { id: string; slug: string } }) {
  const download = () =>
    void downloadArtifactVersion(space.id, artifact.artifactId, artifact.versionId, artifact.title).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Couldn't download the artifact")
    )
  return (
    <div
      aria-label={`Artifact ${artifact.title}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--gray-5)] bg-[var(--gray-2)] px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ReaderIcon aria-hidden className="size-4 shrink-0 text-[var(--gray-10)]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--gray-12)]">{artifact.title}</p>
          <p className="text-xs text-[var(--gray-10)]">
            Version {artifact.number} · {formatLabel(artifact.format)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button outline size="small" href={artifactPath(space.slug, artifact.artifactId, artifact.versionId)}>
          Preview
        </Button>
        <Button outline size="small" onClick={download}>
          Download
        </Button>
      </div>
    </div>
  )
}
