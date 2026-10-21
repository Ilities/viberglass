import { apiFetch } from '@/service/api/client'
import { Cross2Icon } from '@radix-ui/react-icons'
import type { MediaAsset } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'

export const MESSAGE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** The image files among pasted, dropped or picked files. */
export function imageFiles(files: FileList | File[] | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => MESSAGE_IMAGE_TYPES.includes(file.type))
}

/** Images chosen for the message being written, each with a way to take it off again. */
export function ComposerImages({ images, onRemove }: { images: File[]; onRemove: (image: File) => void }) {
  const previews = useMemo(() => images.map((image) => ({ image, url: URL.createObjectURL(image) })), [images])
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews])
  if (previews.length === 0) return null
  return (
    <ul aria-label="Attached images" className="flex flex-wrap gap-2">
      {previews.map(({ image, url }) => (
        <li key={url} className="relative">
          <img src={url} alt={image.name} className="h-16 w-16 rounded-md border border-[var(--gray-6)] object-cover" />
          <button
            type="button"
            aria-label={`Remove ${image.name}`}
            onClick={() => onRemove(image)}
            className="absolute -top-1.5 -right-1.5 rounded-full border border-[var(--gray-6)] bg-[var(--gray-1)] p-0.5 text-[var(--gray-11)] hover:text-[var(--gray-12)]"
          >
            <Cross2Icon className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** An image the API serves to signed-in people, loaded with the sign-in token. */
function ThreadImage({ image }: { image: MediaAsset }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    apiFetch(image.url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [image.url])
  const frame = 'block h-32 max-w-56 overflow-hidden rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)]'
  if (!url) return <span role="img" aria-label={image.filename} className={`${frame} w-32`} />
  return (
    <a href={url} target="_blank" rel="noreferrer" className={frame}>
      <img src={url} alt={image.filename} className="h-full w-auto object-contain" />
    </a>
  )
}

/** The images a message in the thread carries. */
export function MessageImages({ images }: { images: MediaAsset[] }) {
  if (images.length === 0) return null
  return (
    <ul aria-label="Images" className="mt-2 flex flex-wrap gap-2">
      {images.map((image) => (
        <li key={image.id}>
          <ThreadImage image={image} />
        </li>
      ))}
    </ul>
  )
}
