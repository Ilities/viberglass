import { Fieldset } from '@/components/fieldset'
import type { ReactNode } from 'react'

export function RunnerFormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Fieldset className="mt-10 first:mt-0">
      <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">{title}</legend>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      <div className="mt-6">{children}</div>
    </Fieldset>
  )
}
