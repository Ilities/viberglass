import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { Logo } from '@/components/logo'
import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { openApp } from '@/service/api/app-api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

type Opening = { kind: 'opening' } | { kind: 'off'; appName: string; maintainers: string[] } | { kind: 'failed'; message: string }

function whoCanTurnOn(maintainers: string[]): string {
  if (maintainers.length === 0) return 'Ask a workspace admin to turn it on.'
  const names = maintainers.length === 1 ? maintainers[0] : `${maintainers.slice(0, -1).join(', ')} or ${maintainers[maintainers.length - 1]}`
  return `Ask ${names} or a workspace admin to turn it on.`
}

/** Where an app sends people who aren't signed in to it yet: signs them in and sends them back. */
export function OpenAppPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const returnPath = searchParams.get('return') ?? '/'
  const [opening, setOpening] = useState<Opening>({ kind: 'opening' })
  const started = useRef(false)

  const open = useCallback(async () => {
    setOpening({ kind: 'opening' })
    try {
      const handoff = await openApp(slug, returnPath)
      if (handoff.status === 'ready') window.location.replace(handoff.url)
      else setOpening({ kind: 'off', appName: handoff.appName, maintainers: handoff.maintainers })
    } catch (error) {
      setOpening({ kind: 'failed', message: error instanceof Error ? error.message : "Couldn't open the app" })
    }
  }, [slug, returnPath])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void open()
  }, [open])

  return (
    <>
      <PageMeta title="Opening app" />
      <div className="grid w-full max-w-sm grid-cols-1 gap-6">
        <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
        {opening.kind === 'opening' && <Text>Opening the app…</Text>}
        {opening.kind !== 'opening' && (
          <>
            <Heading>{opening.kind === 'off' ? `${opening.appName} is off` : "Couldn't open this app"}</Heading>
            <Text>{opening.kind === 'off' ? whoCanTurnOn(opening.maintainers) : opening.message}</Text>
            <div className="flex gap-3">
              <Button color="brand" onClick={() => void open()}>
                Try again
              </Button>
              <Button outline href="/">
                Go to Viberglass
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
