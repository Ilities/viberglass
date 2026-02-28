import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { MultiSelect } from '@/components/multi-select'
import { Textarea } from '@/components/textarea'
import type { Secret } from '@/service/api/secret-api'
import {
  getNativeAgentConfigDefinition,
  isSupportedNativeAgentConfigAgent,
  type AgentType,
  type CodexAuthMode,
  type DeploymentStrategy,
  type NativeAgentConfigFormat,
} from '@viberglass/types'
import { AgentSpecificFields } from '../config/agents'
import { AgentSelectionCards, DeploymentStrategyCards } from '../config/selectionCards'
import { StrategySpecificFields } from '../config/strategies'
import type { SkillEntry } from '../config/types'

interface ClankerFormProps {
  // Form state
  error: string | null
  isSubmitting: boolean
  submitButtonText: string
  submittingButtonText: string

  // Metadata
  nameDefaultValue?: string
  descriptionDefaultValue?: string

  // Agent
  selectedAgent: AgentType | ''
  onAgentChange: (agent: AgentType | '') => void
  codexAuthMode: CodexAuthMode
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
  qwenEndpoint: string
  onQwenEndpointChange: (endpoint: string) => void
  opencodeEndpoint: string
  onOpenCodeEndpointChange: (endpoint: string) => void
  opencodeModel: string
  onOpenCodeModelChange: (model: string) => void
  geminiModel: string
  onGeminiModelChange: (model: string) => void
  nativeConfigEnabled: boolean
  nativeConfigPath: string
  nativeConfigContent: string
  nativeConfigFormat: NativeAgentConfigFormat | null
  onNativeConfigEnabledChange: (enabled: boolean) => void
  onNativeConfigPathChange: (path: string) => void
  onNativeConfigContentChange: (content: string) => void
  onNativeConfigUploadClick: () => void
  onNativeConfigUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  nativeConfigFileInputRef: React.RefObject<HTMLInputElement | null>
  onLoadNativeConfigTemplate: () => Promise<void>

  // Secrets
  secrets: Secret[]
  selectedSecretIds: string[]
  onSecretIdsChange: (ids: string[]) => void
  showAllSecrets: boolean
  onShowAllSecretsChange: (show: boolean) => void
  selectableSecrets: Secret[]
  secretPickerDescription: string
  secretPickerEmptyMessage: string

  // Deployment
  deploymentStrategies: DeploymentStrategy[]
  selectedStrategyId: string
  onStrategyChange: (strategyId: string) => void
  provisioningMode: 'managed' | 'prebuilt'
  onProvisioningModeChange: (mode: 'managed' | 'prebuilt') => void
  strategyDefaults: {
    containerImage?: string
    clusterArn?: string
    taskDefinitionArn?: string
    functionArn?: string
    lambdaMemorySize?: string
    lambdaTimeout?: string
    lambdaEphemeralStorage?: string
  }

  // Additional Data (AGENTS.md & Skills)
  agentInstructions: string
  onAgentInstructionsChange: (instructions: string) => void
  skills: SkillEntry[]
  onSkillUpdate: (id: string, updates: Partial<SkillEntry>) => void
  onSkillRemove: (id: string) => void
  onAddSkill: () => void
  onAgentsUploadClick: () => void
  onSkillsUploadClick: () => void

  // Refs
  agentsFileInputRef: React.RefObject<HTMLInputElement | null>
  skillsFileInputRef: React.RefObject<HTMLInputElement | null>
  onAgentsUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  onSkillsUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>

  // Events
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

export function ClankerForm({
  error,
  isSubmitting,
  submitButtonText,
  submittingButtonText,
  nameDefaultValue = '',
  descriptionDefaultValue = '',
  selectedAgent,
  onAgentChange,
  codexAuthMode,
  onCodexAuthModeChange,
  qwenEndpoint,
  onQwenEndpointChange,
  opencodeEndpoint,
  onOpenCodeEndpointChange,
  opencodeModel,
  onOpenCodeModelChange,
  geminiModel,
  onGeminiModelChange,
  nativeConfigEnabled,
  nativeConfigPath,
  nativeConfigContent,
  nativeConfigFormat,
  onNativeConfigEnabledChange,
  onNativeConfigPathChange,
  onNativeConfigContentChange,
  onNativeConfigUploadClick,
  onNativeConfigUpload,
  nativeConfigFileInputRef,
  onLoadNativeConfigTemplate,
  selectedSecretIds,
  onSecretIdsChange,
  showAllSecrets,
  onShowAllSecretsChange,
  selectableSecrets,
  secretPickerDescription,
  secretPickerEmptyMessage,
  deploymentStrategies,
  selectedStrategyId,
  onStrategyChange,
  provisioningMode,
  onProvisioningModeChange,
  strategyDefaults,
  agentInstructions,
  onAgentInstructionsChange,
  skills,
  onSkillUpdate,
  onSkillRemove,
  onAddSkill,
  onAgentsUploadClick,
  onSkillsUploadClick,
  agentsFileInputRef,
  skillsFileInputRef,
  onAgentsUpload,
  onSkillsUpload,
  onSubmit,
  onCancel,
}: ClankerFormProps) {
  const selectedStrategy = deploymentStrategies.find((strategy) => strategy.id === selectedStrategyId)
  const supportsNativeConfig = isSupportedNativeAgentConfigAgent(selectedAgent)
  const nativeConfigDefinition = getNativeAgentConfigDefinition(selectedAgent)
  const showStructuredAgentSettings = !nativeConfigEnabled || selectedAgent === 'codex'
  const nativeConfigAccept = nativeConfigFormat === 'toml' ? '.toml,text/plain' : '.json,application/json'

  return (
    <form onSubmit={onSubmit} className="mt-8 w-full max-w-6xl">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <Fieldset>
        <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">Metadata</legend>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Core identity for this clanker.</p>
        <FieldGroup className="mt-6">
          <Field>
            <Label>Name</Label>
            <Description>A unique name for your clanker.</Description>
            <Input name="name" required placeholder="My Awesome Clanker" defaultValue={nameDefaultValue} />
          </Field>

          <Field>
            <Label>Description</Label>
            <Description>A brief description of what this clanker does.</Description>
            <Textarea
              name="description"
              rows={3}
              placeholder="This clanker handles..."
              defaultValue={descriptionDefaultValue}
            />
          </Field>
        </FieldGroup>
      </Fieldset>

      <Fieldset className="mt-10">
        <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">Agent</legend>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Pick an agent</p>
        <FieldGroup className="mt-6">
          <Field>
            <Label>Agent Selection</Label>
            <Description>Select which AI agent powers this clanker.</Description>
            <AgentSelectionCards value={selectedAgent} onChange={onAgentChange} />
          </Field>

          {showStructuredAgentSettings && (
            <AgentSpecificFields
              selectedAgent={selectedAgent}
              strategyName={selectedStrategy?.name}
              codexAuthMode={codexAuthMode}
              qwenEndpoint={qwenEndpoint}
              opencodeEndpoint={opencodeEndpoint}
              opencodeModel={opencodeModel}
              geminiModel={geminiModel}
              onCodexAuthModeChange={onCodexAuthModeChange}
              onQwenEndpointChange={onQwenEndpointChange}
              onOpenCodeEndpointChange={onOpenCodeEndpointChange}
              onOpenCodeModelChange={onOpenCodeModelChange}
              onGeminiModelChange={onGeminiModelChange}
            />
          )}

          {supportsNativeConfig && nativeConfigDefinition && (
            <Field>
              <div className="flex items-center justify-between">
                <Label>Native Tool Config</Label>
                <CheckboxField>
                  <Checkbox
                    checked={nativeConfigEnabled}
                    onChange={(checked) => {
                      if (typeof checked !== 'boolean') {
                        return
                      }

                      onNativeConfigEnabledChange(checked)
                      if (checked && !nativeConfigContent.trim()) {
                        void onLoadNativeConfigTemplate()
                      }
                    }}
                  />
                  <Label>Use native config file</Label>
                </CheckboxField>
              </div>
              <Description>
                Upload or edit the agent&apos;s own {nativeConfigDefinition.format.toUpperCase()} config file. When
                enabled, this file overrides structured tool settings for supported agents.
              </Description>

              {nativeConfigEnabled && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={nativeConfigPath}
                      onChange={(event) => onNativeConfigPathChange(event.target.value)}
                      placeholder={nativeConfigDefinition.defaultPath}
                      className="font-mono"
                    />
                    <input
                      ref={nativeConfigFileInputRef}
                      type="file"
                      accept={nativeConfigAccept}
                      onChange={onNativeConfigUpload}
                      className="hidden"
                    />
                    <Button type="button" outline onClick={onNativeConfigUploadClick}>
                      Upload
                    </Button>
                  </div>
                  <Textarea
                    rows={10}
                    value={nativeConfigContent}
                    onChange={(event) => onNativeConfigContentChange(event.target.value)}
                    placeholder={`Paste ${nativeConfigDefinition.format.toUpperCase()} config here...`}
                    className="font-mono"
                  />
                </div>
              )}
            </Field>
          )}

          <Field>
            <div className="flex items-center justify-between">
              <Label>Secrets</Label>
              <CheckboxField>
                <Checkbox
                  checked={showAllSecrets}
                  onChange={(checked) => {
                    if (typeof checked === 'boolean') {
                      onShowAllSecretsChange(checked)
                    }
                  }}
                />
                <Label>Show all secrets</Label>
              </CheckboxField>
            </div>
            <Description>{secretPickerDescription}</Description>
            <div className="mt-3">
              <MultiSelect
                label=""
                options={selectableSecrets.map((secret) => ({
                  id: secret.id,
                  label: secret.name,
                  description: `${secret.secretLocation}${secret.secretPath ? ` - ${secret.secretPath}` : ''}`,
                }))}
                value={selectedSecretIds}
                onChange={onSecretIdsChange}
                emptyMessage={secretPickerEmptyMessage}
                searchable={true}
              />
            </div>
          </Field>
        </FieldGroup>
      </Fieldset>

      <Fieldset className="mt-10">
        <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">Deployment</legend>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Choose where this clanker runs and provide strategy-specific runtime settings.
        </p>
        <FieldGroup className="mt-6">
          <Field>
            <Label>Deployment Strategy</Label>
            <Description>Choose where this clanker runs.</Description>
            <DeploymentStrategyCards
              strategies={deploymentStrategies}
              value={selectedStrategyId}
              onChange={(strategyId) => {
                onStrategyChange(strategyId)
                onProvisioningModeChange('managed')
              }}
            />
          </Field>

          <StrategySpecificFields
            strategyName={selectedStrategy?.name}
            provisioningMode={provisioningMode}
            onProvisioningModeChange={onProvisioningModeChange}
            defaults={strategyDefaults}
          />
        </FieldGroup>
      </Fieldset>

      <Fieldset className="mt-10">
        <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">Additional Data</legend>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Define global behavior in AGENTS.md and add reusable skills under skills/.
        </p>

        <FieldGroup className="mt-6">
          <Field>
            <div className="flex items-center justify-between">
              <Label>AGENTS.md</Label>
              <div className="flex gap-2">
                <input
                  ref={agentsFileInputRef}
                  type="file"
                  accept=".md,text/markdown"
                  onChange={onAgentsUpload}
                  className="hidden"
                />
                <Button type="button" outline onClick={onAgentsUploadClick}>
                  Upload .md
                </Button>
              </div>
            </div>
            <Description>Main instruction file used to guide this clanker.</Description>
            <Textarea
              rows={8}
              value={agentInstructions}
              onChange={(event) => onAgentInstructionsChange(event.target.value)}
              placeholder="Describe how this clanker should behave..."
              className="font-mono"
            />
          </Field>

          <Field>
            <div className="flex items-center justify-between">
              <Label>Skill Files (skills/**)</Label>
              <div className="flex gap-2">
                <input
                  ref={skillsFileInputRef}
                  type="file"
                  multiple
                  accept=".md,text/markdown"
                  onChange={onSkillsUpload}
                  className="hidden"
                />
                <Button type="button" outline onClick={onSkillsUploadClick}>
                  Upload .md Files
                </Button>
                <Button type="button" outline onClick={onAddSkill}>
                  Add Skill
                </Button>
              </div>
            </div>
            <Description>Each skill must use a path under skills/, for example skills/review.md.</Description>
          </Field>

          {skills.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No skill files yet. Add one manually or upload markdown files.
            </div>
          ) : (
            skills.map((skill) => (
              <div key={skill.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    value={skill.path}
                    onChange={(event) => onSkillUpdate(skill.id, { path: event.target.value })}
                    placeholder="skills/example.md"
                    className="font-mono"
                  />
                  <Button type="button" plain onClick={() => onSkillRemove(skill.id)}>
                    Remove
                  </Button>
                </div>
                <Textarea
                  rows={6}
                  value={skill.content}
                  onChange={(event) => onSkillUpdate(skill.id, { content: event.target.value })}
                  placeholder="Skill instructions..."
                  className="font-mono"
                />
              </div>
            ))
          )}
        </FieldGroup>
      </Fieldset>

      <div className="mt-10 flex gap-4">
        <Button type="submit" color="brand" disabled={isSubmitting}>
          {isSubmitting ? submittingButtonText : submitButtonText}
        </Button>
        <Button type="button" plain onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
