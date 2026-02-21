import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { PageMeta } from '@/components/page-meta'
import { MultiSelect } from '@/components/multi-select'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { createClanker, getDeploymentStrategies } from '@/service/api/clanker-api'
import { getSecrets, type Secret } from '@/service/api/secret-api'
import { AGENT_OPTIONS, DEFAULT_AGENT_TYPE, type AgentType, type ConfigFileInput, type DeploymentStrategy } from '@viberglass/types'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { buildClankerDeploymentConfig } from './config/buildConfig'
import { toAgentType } from './config/normalizers'
import { AgentSpecificFields } from './config/agents'
import { StrategySpecificFields } from './config/strategies'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './config/types'

// Default config file types that users commonly use
const DEFAULT_CONFIG_FILE_TYPES = [
  { type: 'claude.md', label: 'Claude.md', placeholder: '# Claude Configuration\n\nYou are a helpful assistant...' },
  { type: 'agents.md', label: 'Agents.md', placeholder: '# Agents\n\n## Primary Agent\n...' },
  { type: 'skills.md', label: 'Skills.md', placeholder: '# Skills\n\n## Code Review\n...' },
]

export function NewClankerPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deploymentStrategies, setDeploymentStrategies] = useState<DeploymentStrategy[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('')
  const [configFiles, setConfigFiles] = useState<Record<string, string>>({})
  const [customConfigFileName, setCustomConfigFileName] = useState('')
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentType | ''>(DEFAULT_AGENT_TYPE)
  const [selectedSecretIds, setSelectedSecretIds] = useState<string[]>([])
  const [provisioningMode, setProvisioningMode] = useState<'managed' | 'prebuilt'>('managed')
  const [codexAuthMode, setCodexAuthMode] = useState<'api_key' | 'chatgpt_device'>(
    DEFAULT_CLANKER_CONFIG_FORM_STATE.codexAuthMode,
  )

  useEffect(() => {
    async function loadData() {
      try {
        const [strategies, secretsData] = await Promise.all([getDeploymentStrategies(), getSecrets(100, 0)])
        setDeploymentStrategies(strategies)
        setSecrets(secretsData)
      } catch (err) {
        console.error('Failed to load data:', err)
      }
    }
    loadData()
  }, [])

  const selectedStrategy = deploymentStrategies.find((s) => s.id === selectedStrategyId)

  function handleConfigFileChange(fileType: string, content: string) {
    setConfigFiles((prev) => ({ ...prev, [fileType]: content }))
  }

  function addCustomConfigFile() {
    if (customConfigFileName.trim()) {
      setConfigFiles((prev) => ({ ...prev, [customConfigFileName.trim()]: '' }))
      setCustomConfigFileName('')
    }
  }

  function removeConfigFile(fileType: string) {
    setConfigFiles((prev) => {
      const next = { ...prev }
      delete next[fileType]
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    // Build config files array
    const configFilesArray: ConfigFileInput[] = Object.entries(configFiles)
      .filter(([, content]) => content.trim() !== '')
      .map(([fileType, content]) => ({ fileType, content }))

    const deploymentConfig = buildClankerDeploymentConfig({
      strategyName: selectedStrategy?.name,
      selectedAgent,
      form: {
        provisioningMode,
        containerImage: ((formData.get('containerImage') as string) || '').trim(),
        clusterArn: ((formData.get('clusterArn') as string) || '').trim(),
        taskDefinitionArn: ((formData.get('taskDefinitionArn') as string) || '').trim(),
        functionArn: ((formData.get('functionArn') as string) || '').trim(),
        codexAuthMode,
      },
    })

    try {
      const clanker = await createClanker({
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || null,
        deploymentStrategyId: selectedStrategyId || null,
        deploymentConfig,
        configFiles: configFilesArray,
        agent: selectedAgent || null,
        secretIds: selectedSecretIds,
      })
      navigate(`/clankers/${clanker.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create clanker')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <PageMeta title="New Clanker" />
      <Heading>Create New Clanker</Heading>
      <Subheading className="mt-2">Configure a new agent worker for your Viberator tasks.</Subheading>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        Creating a clanker stores its settings only. Use the Start action on the clanker page when you are ready to
        provision it.
      </div>

      <form onSubmit={handleSubmit} className="mt-8 max-w-2xl">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <Fieldset>
          <FieldGroup>
            <Field>
              <Label>Name</Label>
              <Description>A unique name for your clanker.</Description>
              <Input name="name" required placeholder="My Awesome Clanker" />
            </Field>

            <Field>
              <Label>Description</Label>
              <Description>A brief description of what this clanker does.</Description>
              <Textarea name="description" rows={3} placeholder="This clanker handles..." />
            </Field>

            <Field>
              <Label>Deployment Strategy</Label>
              <Description>Choose how to deploy this clanker.</Description>
              <Select
                name="deploymentStrategyId"
                value={selectedStrategyId}
                onChange={(value) => {
                  setSelectedStrategyId(value)
                  setProvisioningMode('managed')
                }}
              >
                <option value="none">Select a deployment strategy...</option>
                {deploymentStrategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name.charAt(0).toUpperCase() + strategy.name.slice(1)}
                    {strategy.description ? ` - ${strategy.description}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <StrategySpecificFields
              strategyName={selectedStrategy?.name}
              provisioningMode={provisioningMode}
              onProvisioningModeChange={setProvisioningMode}
              defaults={DEFAULT_CLANKER_CONFIG_FORM_STATE}
            />

            <Field>
              <Label>Agent</Label>
              <Description>Select which AI agent to use for this clanker.</Description>
              <Select name="agent" value={selectedAgent} onChange={(value) => setSelectedAgent(toAgentType(value))}>
                {AGENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.recommended ? `${option.label} (Recommended)` : option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <AgentSpecificFields
              selectedAgent={selectedAgent}
              strategyName={selectedStrategy?.name}
              codexAuthMode={codexAuthMode}
              onCodexAuthModeChange={setCodexAuthMode}
            />

            <MultiSelect
              label="Secrets"
              description="Select which secrets should be available to this clanker during execution."
              options={secrets.map((secret) => ({
                id: secret.id,
                label: secret.name,
                description: `${secret.secretLocation}${secret.secretPath ? ` - ${secret.secretPath}` : ''}`,
              }))}
              value={selectedSecretIds}
              onChange={setSelectedSecretIds}
              emptyMessage="No secrets available. Create secrets first in the Settings section."
              searchable={true}
            />
          </FieldGroup>
        </Fieldset>

        <Fieldset className="mt-10">
          <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">Configuration Files</legend>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Add markdown files that define how your clanker behaves. You can add custom file types as needed.
          </p>

          <FieldGroup className="mt-6">
            {DEFAULT_CONFIG_FILE_TYPES.map((fileConfig) => (
              <Field key={fileConfig.type}>
                <Label>{fileConfig.label}</Label>
                <Textarea
                  rows={6}
                  value={configFiles[fileConfig.type] || ''}
                  onChange={(e) => handleConfigFileChange(fileConfig.type, e.target.value)}
                  placeholder={fileConfig.placeholder}
                  className="font-mono"
                />
              </Field>
            ))}

            {/* Custom config files */}
            {Object.keys(configFiles)
              .filter((type) => !DEFAULT_CONFIG_FILE_TYPES.some((d) => d.type === type))
              .map((fileType) => (
                <Field key={fileType}>
                  <div className="flex items-center justify-between">
                    <Label>{fileType}</Label>
                    <button
                      type="button"
                      onClick={() => removeConfigFile(fileType)}
                      className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  <Textarea
                    rows={6}
                    value={configFiles[fileType] || ''}
                    onChange={(e) => handleConfigFileChange(fileType, e.target.value)}
                    placeholder={`Content for ${fileType}...`}
                    className="font-mono"
                  />
                </Field>
              ))}

            {/* Add custom config file */}
            <div className="flex items-end gap-2">
              <Field className="flex-1">
                <Label>Add Custom Config File</Label>
                <Input
                  value={customConfigFileName}
                  onChange={(e) => setCustomConfigFileName(e.target.value)}
                  placeholder="e.g., prompts.md, tools.yaml"
                />
              </Field>
              <Button type="button" outline onClick={addCustomConfigFile} disabled={!customConfigFileName.trim()}>
                Add File
              </Button>
            </div>
          </FieldGroup>
        </Fieldset>

        <div className="mt-10 flex gap-4">
          <Button type="submit" color="brand" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Clanker'}
          </Button>
          <Button type="button" plain onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
