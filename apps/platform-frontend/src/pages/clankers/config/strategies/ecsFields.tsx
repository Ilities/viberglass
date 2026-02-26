import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import type { StrategyFieldsRendererProps } from './types'

export function EcsStrategyFields({ provisioningMode, defaults }: StrategyFieldsRendererProps) {
  if (provisioningMode === 'prebuilt') {
    return (
      <>
        <Field>
          <Label>Cluster ARN</Label>
          <Description>The ARN of the ECS cluster.</Description>
          <Input
            name="clusterArn"
            defaultValue={defaults.clusterArn}
            placeholder="arn:aws:ecs:eu-west-1:123456789:cluster/my-cluster"
          />
        </Field>
        <Field>
          <Label>Task Definition ARN</Label>
          <Description>The ARN of the ECS task definition.</Description>
          <Input
            name="taskDefinitionArn"
            defaultValue={defaults.taskDefinitionArn}
            placeholder="arn:aws:ecs:eu-west-1:123456789:task-definition/my-task:1"
          />
        </Field>
      </>
    )
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      Task definition and cluster config will use platform defaults.
    </div>
  )
}
