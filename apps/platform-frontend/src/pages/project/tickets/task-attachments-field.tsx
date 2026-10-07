import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { useEffect, useMemo } from 'react'

export interface TaskAttachments {
  screenshot: File | null
  recording: File | null
}

const IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp'
const VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime'

/** Sorts picked files into the one screenshot and one recording a task can carry; a later pick replaces an earlier one. */
function addFiles(current: TaskAttachments, files: File[]): TaskAttachments {
  return files.reduce<TaskAttachments>((next, file) => {
    if (file.type.startsWith('image/')) return { ...next, screenshot: file }
    if (file.type.startsWith('video/')) return { ...next, recording: file }
    return next
  }, current)
}

/** One picker for a task's screenshot and screen recording. */
export function TaskAttachmentsField({
  value,
  onChange,
}: {
  value: TaskAttachments
  onChange: (value: TaskAttachments) => void
}) {
  const previewUrl = useMemo(
    () => (value.screenshot ? URL.createObjectURL(value.screenshot) : null),
    [value.screenshot]
  )

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const chosen = [value.screenshot, value.recording].filter((file): file is File => file !== null)

  return (
    <Field className="sm:col-span-2">
      <Label>Attachments</Label>
      <Description>One screenshot and one screen recording, up to 10 MB each.</Description>
      <input
        type="file"
        multiple
        accept={`${IMAGE_TYPES},${VIDEO_TYPES}`}
        aria-label="Attachments"
        onChange={(event) => {
          onChange(addFiles(value, Array.from(event.target.files ?? [])))
          event.target.value = ''
        }}
        className="mt-2 block w-full text-sm text-zinc-500 file:mr-4 file:rounded-md file:border file:border-zinc-950/15 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-900 dark:text-zinc-400 dark:file:border-white/15 dark:file:text-white"
      />
      {previewUrl && (
        <img
          src={previewUrl}
          alt="Screenshot preview"
          className="mt-3 max-h-48 rounded-md border border-zinc-950/10 dark:border-white/10"
        />
      )}
      {chosen.length > 0 && (
        <ul className="mt-2 space-y-1">
          {chosen.map((file) => (
            <li
              key={file.name}
              className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-300"
            >
              <span className="truncate">{file.name}</span>
              <Button
                plain
                type="button"
                onClick={() =>
                  onChange(file === value.screenshot ? { ...value, screenshot: null } : { ...value, recording: null })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  )
}
