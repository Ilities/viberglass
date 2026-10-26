import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { FARGATE_CPU_UNITS, fargateMemoryOptions } from '@viberglass/types'
import { useState } from 'react'
import type { StrategyFieldsRendererProps } from './types'

const PLATFORM_DEFAULT = 'default'

const vcpuLabel = (units: string) => `${Number(units) / 1024} vCPU`
const memoryLabel = (mib: string) => `${Number(mib) / 1024} GB`

function EcsSizeFields({ defaults }: Pick<StrategyFieldsRendererProps, 'defaults'>) {
  const [cpu, setCpu] = useState(defaults.ecsCpu)
  const [memory, setMemory] = useState(defaults.ecsMemory)
  const memoryOptions = fargateMemoryOptions(cpu)

  function chooseCpu(next: string) {
    if (!next) return
    const units = next === PLATFORM_DEFAULT ? '' : next
    setCpu(units)
    const allowed = fargateMemoryOptions(units)
    if (!allowed.includes(memory)) setMemory(allowed[0] ?? '')
  }

  // Radix reports an empty value when a controlled select's options change under it; none of these options is empty.
  function chooseMemory(next: string) {
    if (next) setMemory(next)
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <input type="hidden" name="ecsCpu" value={cpu} />
      <input type="hidden" name="ecsMemory" value={memory} />
      <Field>
        <Label>CPU</Label>
        <Description>Per worker. The platform default is 1 vCPU.</Description>
        <Select value={cpu || PLATFORM_DEFAULT} onChange={chooseCpu}>
          <option value={PLATFORM_DEFAULT}>Platform default</option>
          {FARGATE_CPU_UNITS.map((units) => (
            <option key={units} value={units}>{vcpuLabel(units)}</option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label>Memory</Label>
        <Description>Per worker. The platform default is 2 GB.</Description>
        <Select value={memory || PLATFORM_DEFAULT} onChange={chooseMemory} disabled={!cpu}>
          {cpu ? null : <option value={PLATFORM_DEFAULT}>Platform default</option>}
          {memoryOptions.map((mib) => (
            <option key={mib} value={mib}>{memoryLabel(mib)}</option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

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
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        The task definition and cluster use platform defaults. An agent that runs builds or tests can need a bigger size; a new size applies the next time the runner starts.
      </div>
      <EcsSizeFields defaults={defaults} />
    </div>
  )
}
