import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import type { StrategyFieldsRendererProps } from './types'

export function LambdaStrategyFields({ provisioningMode, defaults }: StrategyFieldsRendererProps) {
  if (provisioningMode === 'prebuilt') {
    return (
      <Field>
        <Label>Function ARN</Label>
        <Description>The ARN of the existing Lambda function.</Description>
        <Input
          name="functionArn"
          defaultValue={defaults.functionArn}
          placeholder="arn:aws:lambda:eu-west-1:123456789:function/my-function"
        />
      </Field>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Lambda function will be created on start.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field>
          <Label>Memory Size (MB)</Label>
          <Description>Amount of memory available to the function.</Description>
          <Input
            name="lambdaMemorySize"
            type="number"
            min={128}
            max={10240}
            step={1}
            defaultValue={defaults.lambdaMemorySize}
            placeholder="1024"
          />
        </Field>
        <Field>
          <Label>Timeout (seconds)</Label>
          <Description>Maximum execution time.</Description>
          <Input
            name="lambdaTimeout"
            type="number"
            min={1}
            max={900}
            step={1}
            defaultValue={defaults.lambdaTimeout}
            placeholder="60"
          />
        </Field>
      </div>
    </div>
  )
}
