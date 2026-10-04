import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Switch, SwitchField } from '@/components/switch'
import { buildFeatureBranchName } from '@viberglass/types'

interface SpaceAdvancedSettingsProps {
  hasRepository: boolean
  pullRequestRepository: string
  onPullRequestRepositoryChange: (value: string) => void
  pullRequestBaseBranch: string
  onPullRequestBaseBranchChange: (value: string) => void
  branchNameTemplate: string
  onBranchNameTemplateChange: (value: string) => void
  autoFixEnabled: boolean
  onAutoFixEnabledChange: (value: boolean) => void
  autoFixTags: string
  onAutoFixTagsChange: (value: string) => void
  /** A task key in this space, to show what a branch name comes out as. */
  taskKeyExample: string
}

const DEFAULT_BRANCH_TEMPLATE = 'viberator/{{ ticket }}'

/**
 * What most spaces never change: where pull requests go when it isn't the
 * repository itself, how branches are named, and automatic fixes from a tracker.
 * Folded away so the repository and its branch lead.
 */
export function SpaceAdvancedSettings(props: SpaceAdvancedSettingsProps) {
  const template = props.branchNameTemplate.trim() || DEFAULT_BRANCH_TEMPLATE
  const example = buildFeatureBranchName('run', props.taskKeyExample, props.taskKeyExample, 'runner', template)
  const changed = Boolean(props.pullRequestRepository.trim() || props.pullRequestBaseBranch.trim() || props.branchNameTemplate.trim() || props.autoFixEnabled)

  return (
    <details open={changed} className="rounded-xl border border-zinc-950/10 p-6 dark:border-white/10">
      <summary className="cursor-pointer text-base font-medium text-zinc-950 dark:text-white">
        Advanced: pull request target, branch names and auto-fix
        <span className="mt-1 block text-sm font-normal text-zinc-500 dark:text-zinc-400">
          {changed ? 'Some of these are set.' : 'Pull requests go to the repository above, into its default branch.'}
        </span>
      </summary>
      <FieldGroup className="mt-6 space-y-4">
        <Field>
          <Label>Open pull requests in another repository</Label>
          <Description>Only for forks or mirrors. Leave empty to open them in the repository above.</Description>
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
          <Description>Leave empty to target the default branch.</Description>
          <Input
            name="pr_base_branch"
            placeholder="main"
            value={props.pullRequestBaseBranch}
            onChange={(event) => props.onPullRequestBaseBranchChange(event.target.value)}
            disabled={!props.hasRepository}
          />
        </Field>

        <Field>
          <Label>Branch names</Label>
          <Description>
            How the agent names a task&apos;s branch. With this setting a task&apos;s branch is called <code>{example}</code>. Available
            placeholders: <code>{'{{ ticket }}'}</code> for the task key, <code>{'{{ original_ticket }}'}</code> for the tracker&apos;s
            id, and <code>{'{{ clanker }}'}</code> for the runner.
          </Description>
          <Input
            name="branch_name_template"
            placeholder={DEFAULT_BRANCH_TEMPLATE}
            value={props.branchNameTemplate}
            onChange={(event) => props.onBranchNameTemplateChange(event.target.value)}
            disabled={!props.hasRepository}
          />
        </Field>

        <SwitchField>
          <Label>Fix tracker issues automatically</Label>
          <Description>When an issue from the linked tracker has one of the tags below, the agent starts on it without being asked.</Description>
          <Switch checked={props.autoFixEnabled} onChange={props.onAutoFixEnabledChange} />
        </SwitchField>

        {props.autoFixEnabled && (
          <Field>
            <Label>Tags that start a fix</Label>
            <Description>Separate tags with commas, e.g. &quot;bug, fix-requested&quot;.</Description>
            <Input name="auto_fix_tags" value={props.autoFixTags} onChange={(event) => props.onAutoFixTagsChange(event.target.value)} placeholder="bug, fix-requested" />
          </Field>
        )}
      </FieldGroup>
    </details>
  )
}
