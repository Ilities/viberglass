import { Button } from '@/components/button'
import { FieldGroup, Field, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Textarea } from '@/components/textarea'
import { getDeploymentStrategies } from '@/service/api/clanker-api'
import { listAllSecrets, type Secret } from '@/service/api/secret-api'
import {
  DEFAULT_AGENT_TYPE,
  type AgentType,
  type Clanker,
  type CreateClankerRequest,
  type DeploymentStrategy,
  type ModelProviderId,
  type SecretBinding,
} from '@viberglass/types'
import { useEffect, useState, type ReactNode } from 'react'
import type { AgentSettings } from '../config/agents'
import { describeBindingsProblem } from '../config/agentSecrets'
import { buildClankerDeploymentConfig } from '../config/buildConfig'
import { keysForProvider, providerOptionsForAgent, settingsForProvider, splitRunnerBindings } from '../config/modelKey'
import { readClankerDeploymentConfig } from '../config/readConfig'
import { SecretBindingsField } from '../config/secret-bindings-field'
import { DeploymentStrategyCards } from '../config/selectionCards'
import { StrategySpecificFields } from '../config/strategies'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE, type ProvisioningMode } from '../config/types'
import { AGENTS_FILE_TYPE, getHarnessConfigFile } from '../instructionFiles'
import { AgentInstructionsField } from './AgentInstructionsField'
import { AgentSection } from './AgentSection'
import { buildConfigFiles } from './configFiles'
import { HarnessConfigEditor } from './HarnessConfigEditor'
import { ModelSection } from './ModelSection'
import { ToolsSection } from './ToolsSection'

interface RunnerFormProps {
  /** The runner being edited; absent when creating one. */
  initial?: Clanker
  submitLabel: string
  submittingLabel: string
  onSubmit: (request: CreateClankerRequest) => Promise<void>
  onCancel: () => void
}

function settingsOf(form: AgentSettings): AgentSettings {
  const { codexAuthMode, codexLoginSecretId, qwenEndpoint, opencodeEndpoint, opencodeModel, antigravityModel, kimiEndpoint, kimiModel } =
    form
  return { codexAuthMode, codexLoginSecretId, qwenEndpoint, opencodeEndpoint, opencodeModel, antigravityModel, kimiEndpoint, kimiModel }
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Fieldset className="mt-10 first:mt-0">
      <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">{title}</legend>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      <div className="mt-6">{children}</div>
    </Fieldset>
  )
}

/** Creates or edits a runner: agent, then model and key, compute, instructions, tools, and extra variables. */
export function RunnerForm({ initial, submitLabel, submittingLabel, onSubmit, onCancel }: RunnerFormProps) {
  const initialForm = initial
    ? readClankerDeploymentConfig({ deploymentConfig: initial.deploymentConfig, agent: initial.agent }).form
    : DEFAULT_CLANKER_CONFIG_FORM_STATE

  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deploymentStrategies, setDeploymentStrategies] = useState<DeploymentStrategy[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = useState(initial?.deploymentStrategyId ?? '')
  const [provisioningMode, setProvisioningMode] = useState<ProvisioningMode>(initialForm.provisioningMode)
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [agent, setAgent] = useState<AgentType | ''>(initial?.agent ?? DEFAULT_AGENT_TYPE)
  const [settings, setSettings] = useState<AgentSettings>(settingsOf(initialForm))
  const [provider, setProvider] = useState<ModelProviderId | ''>('')
  const [modelKeyId, setModelKeyId] = useState('')
  const [modelKeyEnvVar, setModelKeyEnvVar] = useState('')
  const [extras, setExtras] = useState<SecretBinding[]>([])
  const [agentInstructions, setAgentInstructions] = useState('')
  const [harnessEnabled, setHarnessEnabled] = useState(false)
  const [harnessContent, setHarnessContent] = useState('')
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(initial?.mcpServerIds ?? [])
  const [skillIds, setSkillIds] = useState<string[]>(initial?.skillIds ?? [])

  useEffect(() => {
    async function load() {
      try {
        const [strategies, allSecrets] = await Promise.all([getDeploymentStrategies(), listAllSecrets()])
        setDeploymentStrategies(strategies)
        setSecrets(allSecrets)
        if (!initial) {
          // A new runner on an agent with one provider starts with that provider's newest key.
          const options = providerOptionsForAgent(DEFAULT_AGENT_TYPE)
          if (options.length === 1) {
            setProvider(options[0].provider)
            setModelKeyId(keysForProvider(allSecrets, options[0].provider)[0]?.id ?? '')
          }
          return
        }

        const keys = splitRunnerBindings(initial.secretBindings, allSecrets, initial.agent ?? '')
        setProvider(keys.provider)
        setModelKeyId(keys.modelKey?.secretId ?? '')
        setModelKeyEnvVar(keys.modelKey?.envVar ?? '')
        setExtras(keys.extras)

        const harnessConfig = getHarnessConfigFile(initial.agent ?? '')
        for (const file of initial.configFiles) {
          if (file.fileType === AGENTS_FILE_TYPE) setAgentInstructions(file.content)
          else if (harnessConfig && file.fileType === harnessConfig.fileType) {
            setHarnessContent(file.content)
            setHarnessEnabled(true)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load runner settings')
      }
    }
    void load()
  }, [initial])

  const selectedStrategy = deploymentStrategies.find((strategy) => strategy.id === selectedStrategyId)
  const providerOptions = providerOptionsForAgent(agent)
  const currentOption = providerOptions.find((option) => option.provider === provider)
  const usesChatGptLogin = agent === 'codex' && settings.codexAuthMode !== 'api_key'
  const modelKey: SecretBinding | null =
    modelKeyId && !usesChatGptLogin
      ? { secretId: modelKeyId, envVar: currentOption?.envVar ?? modelKeyEnvVar }
      : null
  const bindings = [...(modelKey ? [modelKey] : []), ...extras]

  function changeSettings(changes: Partial<AgentSettings>) {
    setSettings((previous) => ({ ...previous, ...changes }))
  }

  function chooseProvider(next: ModelProviderId | '', forAgent: AgentType | '' = agent) {
    const options = providerOptionsForAgent(forAgent)
    const to = options.find((option) => option.provider === next)
    changeSettings(settingsForProvider(forAgent, settings, currentOption, to))
    setProvider(next)
    setModelKeyEnvVar('')
    const keys = keysForProvider(secrets, next)
    setModelKeyId((previous) => (keys.some((secret) => secret.id === previous) ? previous : (keys[0]?.id ?? '')))
  }

  function chooseAgent(next: AgentType) {
    setAgent(next)
    const options = providerOptionsForAgent(next)
    const kept = options.some((option) => option.provider === provider)
    chooseProvider(kept ? provider : options.length === 1 ? options[0].provider : '', next)
    if (!getHarnessConfigFile(next)) {
      setHarnessEnabled(false)
      setHarnessContent('')
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const field = (name: string) => String(formData.get(name) ?? '').trim()
    const harnessConfig = getHarnessConfigFile(agent)
    const configFiles = buildConfigFiles(agentInstructions, harnessConfig?.fileType ?? '', harnessEnabled ? harnessContent : '')
    const problem = describeBindingsProblem(bindings)
    if (problem) {
      setError(problem)
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        name: field('name'),
        description: field('description') || null,
        deploymentStrategyId: selectedStrategyId || null,
        deploymentConfig: buildClankerDeploymentConfig({
          strategyName: selectedStrategy?.name,
          selectedAgent: agent,
          existing: initial?.deploymentConfig,
          form: {
            ...settings,
            provisioningMode,
            containerImage: field('containerImage'),
            clusterArn: field('clusterArn'),
            taskDefinitionArn: field('taskDefinitionArn'),
            functionArn: field('functionArn'),
            lambdaMemorySize: field('lambdaMemorySize'),
            lambdaTimeout: field('lambdaTimeout'),
            lambdaEphemeralStorage: field('lambdaEphemeralStorage'),
          },
        }),
        configFiles,
        agent: agent || null,
        secretBindings: bindings,
        mcpServerIds,
        skillIds,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save agent runner')
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full max-w-6xl">
      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <Section title="Name" description="How this runner appears when you pick one for a task.">
        <FieldGroup>
          <Field>
            <Label>Name</Label>
            <Input name="name" required defaultValue={initial?.name} placeholder="Main coding runner" />
          </Field>
          <Field>
            <Label>Description</Label>
            <Textarea name="description" rows={2} defaultValue={initial?.description ?? ''} />
          </Field>
        </FieldGroup>
      </Section>

      <Section title="Agent" description="The coding agent that does the work.">
        <AgentSection value={agent} onChange={chooseAgent} collapsed={Boolean(initial)} />
      </Section>

      <Section title="Model" description="Which AI provider the agent uses, and with which key.">
        <ModelSection
          agent={agent}
          provider={provider}
          modelKeyId={modelKeyId}
          secrets={secrets}
          settings={settings}
          onProviderChange={(next) => chooseProvider(next)}
          onModelKeyChange={setModelKeyId}
          onSettingsChange={changeSettings}
          onKeyAdded={(secret) => {
            setSecrets((previous) => [secret, ...previous])
            setModelKeyId(secret.id)
          }}
        />
      </Section>

      <Section title="Compute" description="Where the agent runs.">
        <FieldGroup>
          <DeploymentStrategyCards
            strategies={deploymentStrategies}
            value={selectedStrategyId}
            onChange={(strategyId) => {
              setSelectedStrategyId(strategyId)
              setProvisioningMode('managed')
            }}
          />
          <StrategySpecificFields
            strategyName={selectedStrategy?.name}
            provisioningMode={provisioningMode}
            onProvisioningModeChange={setProvisioningMode}
            defaults={initialForm}
          />
        </FieldGroup>
      </Section>

      <Section title="Instructions" description="AGENTS.md and the agent's own config file.">
        <FieldGroup>
          <AgentInstructionsField
            agentInstructions={agentInstructions}
            onAgentInstructionsChange={setAgentInstructions}
            onError={setError}
          />
          <HarnessConfigEditor
            agent={agent}
            enabled={harnessEnabled}
            content={harnessContent}
            boundEnvVars={bindings.map((binding) => binding.envVar)}
            onEnable={() => {
              setHarnessContent(getHarnessConfigFile(agent)?.placeholder ?? '')
              setHarnessEnabled(true)
            }}
            onRemove={() => {
              setHarnessEnabled(false)
              setHarnessContent('')
            }}
            onChange={setHarnessContent}
          />
        </FieldGroup>
      </Section>

      <Section title="Tools" description="MCP servers and skills an admin approved for the workspace.">
        <ToolsSection
          mcpServerIds={mcpServerIds}
          skillIds={skillIds}
          onMcpServerIdsChange={setMcpServerIds}
          onSkillIdsChange={setSkillIds}
        />
      </Section>

      <Section
        title="Extra environment variables"
        description="Other secrets the agent can use, such as tokens for MCP servers or documentation tools. Repository and cloud credentials never reach the agent."
      >
        <SecretBindingsField
          secrets={secrets}
          selectable={secrets.filter((secret) => secret.id !== modelKey?.secretId && !secret.purpose)}
          bindings={extras}
          onChange={setExtras}
          agent={agent}
          emptyMessage="No other secrets yet. Add them on the Secrets page."
        />
      </Section>

      <div className="mt-10 flex gap-4">
        <Button type="submit" color="brand" disabled={isSubmitting}>
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
        <Button type="button" plain onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
