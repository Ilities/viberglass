import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import { getClankers } from '@/service/api/clanker-api'
import { deleteSkill, listSkills, uploadSkill } from '@/service/api/skill-api'
import type { Clanker, Skill } from '@viberglass/types'
import { TrashIcon, UploadIcon } from '@radix-ui/react-icons'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The workspace's skills: folders with a SKILL.md, uploaded here and picked by runners. */
export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [runners, setRunners] = useState<Clanker[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<Skill | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const replacing = useRef<Skill | undefined>(undefined)
  const usedBy = useMemo(() => {
    const names = new Map<string, string[]>()
    for (const runner of runners) for (const id of runner.skillIds) names.set(id, [...(names.get(id) ?? []), runner.name])
    return names
  }, [runners])

  useEffect(() => {
    Promise.all([listSkills(), getClankers(100).catch(() => [])])
      .then(([skills, runners]) => {
        setSkills(skills)
        setRunners(runners)
      })
      .catch((error) => toast.error("Couldn't load skills", { description: error instanceof Error ? error.message : undefined }))
      .finally(() => setLoading(false))
  }, [])

  function pickFile(skill?: Skill) {
    replacing.current = skill
    fileInput.current?.click()
  }

  async function upload(file: File) {
    setUploading(true)
    try {
      const skill = await uploadSkill(file, replacing.current?.id)
      setSkills((previous) => [...previous.filter((other) => other.id !== skill.id), skill].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success(replacing.current ? `Uploaded a new version of ${skill.name}` : `Added ${skill.name}`)
    } catch (error) {
      toast.error("Couldn't upload the skill", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function confirmRemove() {
    if (!removing) return
    try {
      await deleteSkill(removing.id)
      setSkills((previous) => previous.filter((skill) => skill.id !== removing.id))
      toast.success('Skill removed')
    } catch (error) {
      toast.error("Couldn't remove the skill", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setRemoving(null)
    }
  }

  const uploadButton = (
    <Button color="brand" onClick={() => pickFile()} disabled={uploading}>
      <UploadIcon />
      {uploading ? 'Uploading…' : 'Upload skill'}
    </Button>
  )

  return (
    <>
      <PageMeta title="Skills" />
      <input
        ref={fileInput}
        type="file"
        accept=".zip,.md"
        className="hidden"
        aria-label="Skill file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />
      <div className="space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Heading>Skills</Heading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Instructions and scripts agents load when a task calls for them. Upload a .zip of a skill&apos;s folder, or
              just its SKILL.md, then pick it in a runner&apos;s Tools section.
            </p>
          </div>
          {uploadButton}
        </div>

        {loading ? (
          <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">Loading…</div>
        ) : skills.length === 0 ? (
          <EmptyState
            title="No skills yet"
            description="A skill is a folder with a SKILL.md whose frontmatter has a name and a description of when to use it."
            action={uploadButton}
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Skill</TableHeader>
                <TableHeader>Files</TableHeader>
                <TableHeader>Used by</TableHeader>
                <TableHeader>Updated</TableHeader>
                <TableHeader />
              </TableRow>
            </TableHead>
            <TableBody>
              {skills.map((skill) => (
                <TableRow key={skill.id}>
                  <TableCell className="max-w-md font-medium text-zinc-950 dark:text-white">
                    <span className="font-mono">{skill.name}</span>
                    <div className="line-clamp-2 text-xs font-normal whitespace-normal text-zinc-500 dark:text-zinc-400">{skill.description}</div>
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    {skill.fileCount === 1 ? '1 file' : `${skill.fileCount} files`} · {formatSize(skill.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">{usedBy.get(skill.id)?.join(', ') ?? 'No runner'}</TableCell>
                  <TableCell className="text-zinc-500 dark:text-zinc-400">
                    <Timestamp date={skill.updatedAt} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button plain onClick={() => pickFile(skill)} disabled={uploading} aria-label={`Upload a new version of ${skill.name}`}>
                        <UploadIcon className="h-4 w-4" />
                      </Button>
                      <Button surface color="red" onClick={() => setRemoving(skill)} aria-label={`Remove ${skill.name}`}>
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Alert open={removing !== null} onClose={() => setRemoving(null)}>
        <AlertTitle>Remove {removing?.name}?</AlertTitle>
        <AlertDescription>Runners can no longer pick it. A skill some runner still uses can&apos;t be removed.</AlertDescription>
        <AlertActions>
          <Button outline onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmRemove}>
            Remove
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}
