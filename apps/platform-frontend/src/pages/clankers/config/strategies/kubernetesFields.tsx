import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import type { ClankerConfigFormState } from '../types'

export function KubernetesStrategyFields({ defaults }: { defaults: ClankerConfigFormState }) {
  return <>
    <Field><Label>Container Image</Label><Description>Use a prebuilt worker image. Leave empty to use this agent's default image.</Description>
      <Input name="containerImage" defaultValue={defaults.containerImage} placeholder="ghcr.io/myorg/worker:1" />
    </Field>
    <Field><Label>CPU</Label><Description>CPU requested and limited per worker, for example 500m or 1.</Description>
      <Input name="kubernetesCpu" defaultValue={defaults.kubernetesCpu} placeholder="500m" />
    </Field>
    <Field><Label>Memory</Label><Description>Memory requested and limited per worker.</Description>
      <Input name="kubernetesMemory" defaultValue={defaults.kubernetesMemory} placeholder="1Gi" />
    </Field>
    <Field><Label>Temporary Storage</Label><Description>Disk space for the repository and agent workspace.</Description>
      <Input name="kubernetesStorage" defaultValue={defaults.kubernetesStorage} placeholder="2Gi" />
    </Field>
    <Field><Label>Time Limit (seconds)</Label><Description>Maximum time allowed for one worker run.</Description>
      <Input name="kubernetesDeadline" type="number" min={1} step={1} defaultValue={defaults.kubernetesDeadline} placeholder="3600" />
    </Field>
  </>
}
