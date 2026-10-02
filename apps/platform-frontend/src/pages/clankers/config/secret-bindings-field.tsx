import { Input } from '@/components/input'
import { MultiSelect } from '@/components/multi-select'
import type { Secret } from '@/service/api/secret-api'
import type { AgentType, SecretBinding } from '@viberglass/types'
import { applySecretSelection, buildSecretPickerOptions } from './agentSecrets'

interface SecretBindingsFieldProps {
  secrets: Secret[]
  selectable: Secret[]
  bindings: SecretBinding[]
  onChange: (bindings: SecretBinding[]) => void
  agent: AgentType | '' | null | undefined
  emptyMessage: string
}

/** Picks secrets and names the env var each one is exposed as. */
export function SecretBindingsField({
  secrets,
  selectable,
  bindings,
  onChange,
  agent,
  emptyMessage,
}: SecretBindingsFieldProps) {
  const selectedIds = bindings.map((binding) => binding.secretId)

  return (
    <div className="space-y-4">
      <MultiSelect
        label=""
        options={buildSecretPickerOptions(secrets, selectable, selectedIds, agent)}
        value={selectedIds}
        onChange={(ids) => onChange(applySecretSelection(bindings, ids, secrets, agent))}
        emptyMessage={emptyMessage}
        searchable={true}
      />
      {bindings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Exposed to the agent as</p>
          {bindings.map((binding) => (
            <div key={binding.secretId} className="grid grid-cols-2 items-center gap-3">
              <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                {secrets.find((secret) => secret.id === binding.secretId)?.name ?? 'Deleted secret'}
              </span>
              <Input
                aria-label="Environment variable"
                value={binding.envVar}
                onChange={(event) =>
                  onChange(
                    bindings.map((candidate) =>
                      candidate.secretId === binding.secretId
                        ? { ...candidate, envVar: event.target.value.toUpperCase() }
                        : candidate,
                    ),
                  )
                }
                className="font-mono"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
