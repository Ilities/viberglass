import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { useState } from 'react'

interface SsmPathFieldProps {
  name: string
  path: string
  ssmPrefix: string
  onChange: (path: string) => void
}

export function defaultSsmPath(ssmPrefix: string, name: string): string {
  return `${ssmPrefix}/${name.trim() || '<NAME>'}`
}

/** The SSM parameter a secret is stored at: the default path, with a custom one tucked under Advanced. */
export function SsmPathField({ name, path, ssmPrefix, onChange }: SsmPathFieldProps) {
  const defaultPath = defaultSsmPath(ssmPrefix, name)
  // Opens by itself only for a secret that already has a custom path.
  const [advancedOpen, setAdvancedOpen] = useState(() => path.trim() !== '' && path.trim() !== defaultPath)

  return (
    <Field>
      <Label>SSM parameter</Label>
      <Description data-testid="ssm-path-summary">
        Stored at <code>{path.trim() || defaultPath}</code>. Agents on ECS and Lambda look the secret up at this path.
      </Description>
      <details
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
      >
        <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Advanced: use a custom path
        </summary>
        <div className="mt-3 space-y-2">
          <Input value={path} onChange={(event) => onChange(event.target.value)} placeholder={defaultPath} />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Leave empty to use <code>{defaultPath}</code>. Agents on ECS and Lambda find a secret only at{' '}
            <code>{ssmPrefix}/</code> plus its name, and may read nothing outside <code>{ssmPrefix}/</code>, so a secret
            at a custom path never reaches them. Use one only for a parameter that already exists elsewhere and that
            only the platform reads, such as a Docker runner&apos;s or an integration&apos;s credential.
          </p>
        </div>
      </details>
    </Field>
  )
}
