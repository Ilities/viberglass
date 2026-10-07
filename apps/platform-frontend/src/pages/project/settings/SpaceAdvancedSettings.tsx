import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { buildFeatureBranchName } from '@viberglass/types'

interface SpaceAdvancedSettingsProps {
  hasRepository: boolean
  /** What pull requests target when no other branch is given. */
  defaultBranch: string
  pullRequestRepository: string
  onPullRequestRepositoryChange: (value: string) => void
  pullRequestBaseBranch: string
  onPullRequestBaseBranchChange: (value: string) => void
  branchNameTemplate: string
  onBranchNameTemplateChange: (value: string) => void
  /** A task key in this space, to show what a branch name comes out as. */
  taskKeyExample: string
}

const DEFAULT_BRANCH_TEMPLATE = 'viberglass/{{ ticket }}'

/**
 * What most spaces never change: where pull requests go when it isn't the
 * repository itself, and how branches are named.
 * Folded away so the repository and its branch lead.
 */
export function SpaceAdvancedSettings(props: SpaceAdvancedSettingsProps) {
  const template = props.branchNameTemplate.trim() || DEFAULT_BRANCH_TEMPLATE
  const example = buildFeatureBranchName('run', props.taskKeyExample, props.taskKeyExample, 'runner', template)
  const changed = Boolean(props.pullRequestRepository.trim() || props.pullRequestBaseBranch.trim() || props.branchNameTemplate.trim())

  return (
    <details open={changed} className="rounded-xl border border-zinc-950/10 p-6 dark:border-white/10">
      <summary className="cursor-pointer text-base font-medium text-zinc-950 dark:text-white">
        Advanced
        <span className="mt-1 block text-sm font-normal text-zinc-500 dark:text-zinc-400">Pull request target, branch names</span>
      </summary>
      <FieldGroup className="mt-6 space-y-4">
        <Field>
          <Label>Open pull requests in another repository</Label>
          <Description>Only for forks or mirrors.</Description>
          <Input
            name="pr_repository"
            placeholder="https://github.com/acme/storefront"
            value={props.pullRequestRepository}
            onChange={(event) => props.onPullRequestRepositoryChange(event.target.value)}
            disabled={!props.hasRepository}
          />
        </Field>

        <Field>
          <Label>Pull request target branch</Label>
          <Input
            name="pr_base_branch"
            placeholder={props.defaultBranch.trim() || 'main'}
            value={props.pullRequestBaseBranch}
            onChange={(event) => props.onPullRequestBaseBranchChange(event.target.value)}
            disabled={!props.hasRepository}
          />
        </Field>

        <Field>
          <Label>Branch names</Label>
          <Description>
            Comes out as <code>{example}</code>. Placeholders: <code>{'{{ ticket }}'}</code> for the task key,{' '}
            <code>{'{{ original_ticket }}'}</code> for the tracker&apos;s id.
          </Description>
          <Input
            name="branch_name_template"
            placeholder={DEFAULT_BRANCH_TEMPLATE}
            value={props.branchNameTemplate}
            onChange={(event) => props.onBranchNameTemplateChange(event.target.value)}
            disabled={!props.hasRepository}
          />
        </Field>

      </FieldGroup>
    </details>
  )
}
