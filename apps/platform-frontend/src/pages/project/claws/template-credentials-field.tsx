import { Description, Field, Label } from '@/components/fieldset'
import { SecretBindingsField } from '@/pages/clankers/config/secret-bindings-field'
import type { Clanker } from '@/service/api/clanker-api'
import type { Secret } from '@/service/api/secret-api'
import type { SecretBinding } from '@viberglass/types'

interface Props {
  /** Only admins see the workspace's secrets, so only they pick a template's credentials. */
  canChoose: boolean
  secrets: Secret[]
  bindings: SecretBinding[]
  onChange: (bindings: SecretBinding[]) => void
  agent: Clanker['agent'] | undefined
}

export function TemplateCredentialsField({ canChoose, secrets, bindings, onChange, agent }: Props) {
  if (!canChoose) {
    return (
      <Field>
        <Label>Credentials</Label>
        <Description>
          {bindings.length > 0
            ? `Runs also get ${bindings.map((binding) => binding.envVar).join(', ')}. Only admins change credentials.`
            : 'None. Only admins choose credentials.'}
        </Description>
      </Field>
    )
  }
  return (
    <Field>
      <Label>Credentials</Label>
      <Description>Secrets the agent gets on top of its own.</Description>
      <SecretBindingsField
        secrets={secrets}
        selectable={secrets.filter((secret) => !secret.purpose)}
        bindings={bindings}
        onChange={onChange}
        agent={agent}
        emptyMessage="No secrets configured. Add secrets in the Secrets section."
      />
    </Field>
  )
}
