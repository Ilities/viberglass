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
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
      Lambda function will be created on start.
    </div>
  )
}
