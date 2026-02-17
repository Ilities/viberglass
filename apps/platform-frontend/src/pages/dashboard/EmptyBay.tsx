import { Button } from '@/components/button'
import { RetroSeparator } from '@/components/retro-decorations'
import { PlusIcon } from '@radix-ui/react-icons'

export function EmptyBay({
  title,
  description,
  asciiArt,
  href,
  actionLabel,
}: {
  title: string
  description: string
  asciiArt: React.ReactNode
  href?: string
  actionLabel?: string
}) {
  return (
    <div className="hover-lift rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <RetroSeparator className="mb-3" />
      <div className="float mb-3 flex justify-center">{asciiArt}</div>
      <h3 className="font-mono text-sm font-semibold text-zinc-950 dark:text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      {href && actionLabel ? (
        <div className="mt-4">
          <Button href={href} color="brand">
            <PlusIcon data-slot="icon" />
            {actionLabel}
          </Button>
        </div>
      ) : null}
      <RetroSeparator className="mt-3" />
    </div>
  )
}
