import { Heading } from '@/components/heading'
import { Logo } from '@/components/logo'
import { Text } from '@/components/text'
import { Link as RadixLink } from '@radix-ui/themes'

export const SETUP_STEP_COUNT = 5

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <RadixLink href={href} target="_blank" rel="noreferrer">
      {children}
    </RadixLink>
  )
}

export function SetupError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
      {message}
    </div>
  )
}

/** One setup screen: where you are, what it's for, and its form or progress. */
export function SetupFrame({
  step,
  title,
  intro,
  children,
}: {
  step: number
  title: string
  intro: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid w-full max-w-md grid-cols-1 gap-8">
      <Logo className="h-6 text-zinc-950 dark:text-white forced-colors:text-[CanvasText]" />
      <div className="grid gap-2">
        <Text className="text-xs font-medium tracking-wide uppercase">
          Step {step} of {SETUP_STEP_COUNT}
        </Text>
        <Heading>{title}</Heading>
        <Text>{intro}</Text>
      </div>
      {children}
    </div>
  )
}
