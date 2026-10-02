import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { useState } from 'react'

interface SsmPathFieldProps {
  path: string
  /** The path the secret is stored at now; absent for a new secret. */
  storedPath?: string | null
  ssmPrefix: string
  onChange: (path: string) => void
}

/** The SSM parameter a secret is stored at: under the prefix by its id, with a custom one tucked under Advanced. */
export function SsmPathField({ path, storedPath, ssmPrefix, onChange }: SsmPathFieldProps) {
  const defaultPath = storedPath || `${ssmPrefix}/<secret id>`
  // Opens by itself only for a secret that already has a path outside the prefix.
  const [advancedOpen, setAdvancedOpen] = useState(() => path.trim() !== '' && !path.trim().startsWith(`${ssmPrefix}/`))

  return (
    <Field>
      <Label>SSM parameter</Label>
      <Description data-testid="ssm-path-summary">
        Stored at <code>{path.trim() || defaultPath}</code>. Renaming the secret doesn&apos;t move it.
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
            Leave empty to use <code>{defaultPath}</code>. Agents on ECS and Lambda may read nothing outside{' '}
            <code>{ssmPrefix}/</code>, so a secret at a custom path elsewhere never reaches them. Use one only for a
            parameter that already exists and that only the platform reads, such as a Docker runner&apos;s or an
            integration&apos;s credential.
          </p>
        </div>
      </details>
    </Field>
  )
}
