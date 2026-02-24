import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { MultiSelect } from '@/components/multi-select'
import { PageMeta } from '@/components/page-meta'
import { Textarea } from '@/components/textarea'
import { createClanker, getDeploymentStrategies } from '@/service/api/clanker-api'
import { getSecrets, type Secret } from '@/service/api/secret-api'
import {
  DEFAULT_AGENT_TYPE,
  type AgentType,
  type CodexAuthMode,
  type ConfigFileInput,
  type DeploymentStrategy,
} from '@viberglass/types'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentSpecificFields } from './config/agents'
import { filterSecretsForAgent, getSecretPickerDescription, getSecretPickerEmptyMessage } from './config/agentSecrets'
import { buildClankerDeploymentConfig } from './config/buildConfig'
import { AgentSelectionCards, DeploymentStrategyCards } from './config/selectionCards'
import { StrategySpecificFields } from './config/strategies'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './config/types'
import { AGENTS_FILE_TYPE, isSkillPath, normalizeInstructionPath, skillPathFromUploadName } from './instructionFiles'

interface SkillEntry {
  id: string
  path: string
  content: string
}

function createSkillEntry(path: string = 'skills/new-skill.md', content = ''): SkillEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    path,
    content,
  }
}

function buildConfigFiles(
  agentInstructions: string,
  skills: SkillEntry[]
): { files: ConfigFileInput[]; error: string | null } {
  const files: ConfigFileInput[] = []

  if (agentInstructions.trim()) {
    files.push({ fileType: AGENTS_FILE_TYPE, content: agentInstructions.trim() })
  }

  const usedSkillPaths = new Set<string>()
  for (const skill of skills) {
    if (!skill.content.trim()) {
      continue
    }

    const normalizedPath = normalizeInstructionPath(skill.path)
    if (!isSkillPath(normalizedPath)) {
      return {
        files: [],
        error: `Invalid skill path "${skill.path}". Use skills/<name>.md or nested paths under skills/.`,
      }
    }

    const dedupeKey = normalizedPath.toLowerCase()
    if (usedSkillPaths.has(dedupeKey)) {
      return {
        files: [],
        error: `Duplicate skill path: ${normalizedPath}`,
      }
    }

    usedSkillPaths.add(dedupeKey)
    files.push({ fileType: normalizedPath, content: skill.content.trim() })
  }

  return { files, error: null }
}

export function NewClankerPage() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deploymentStrategies, setDeploymentStrategies] = useState<DeploymentStrategy[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('')
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentType | ''>(DEFAULT_AGENT_TYPE)
  const [selectedSecretIds, setSelectedSecretIds] = useState<string[]>([])
  const [provisioningMode, setProvisioningMode] = useState<'managed' | 'prebuilt'>('managed')
  const [codexAuthMode, setCodexAuthMode] = useState<CodexAuthMode>(DEFAULT_CLANKER_CONFIG_FORM_STATE.codexAuthMode)
  const [qwenEndpoint, setQwenEndpoint] = useState(DEFAULT_CLANKER_CONFIG_FORM_STATE.qwenEndpoint)
  const [opencodeEndpoint, setOpencodeEndpoint] = useState(DEFAULT_CLANKER_CONFIG_FORM_STATE.opencodeEndpoint)
  const [opencodeModel, setOpencodeModel] = useState(DEFAULT_CLANKER_CONFIG_FORM_STATE.opencodeModel)
  const [geminiModel, setGeminiModel] = useState(DEFAULT_CLANKER_CONFIG_FORM_STATE.geminiModel)
  const [agentInstructions, setAgentInstructions] = useState('')
  const [skills, setSkills] = useState<SkillEntry[]>([])

  const agentsFileInputRef = useRef<HTMLInputElement | null>(null)
  const skillsFileInputRef = useRef<HTMLInputElement | null>(null)

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

  const selectedStrategy = deploymentStrategies.find((strategy) => strategy.id === selectedStrategyId)
  const selectableSecrets = useMemo(
    () => filterSecretsForAgent(secrets, selectedAgent, codexAuthMode),
    [codexAuthMode, secrets, selectedAgent]
  )
  const selectableSecretIds = useMemo(() => new Set(selectableSecrets.map((secret) => secret.id)), [selectableSecrets])
  const secretPickerDescription = useMemo(
    () => getSecretPickerDescription(selectedAgent, codexAuthMode),
    [codexAuthMode, selectedAgent]
  )
  const secretPickerEmptyMessage = useMemo(
    () => getSecretPickerEmptyMessage(selectedAgent, codexAuthMode),
    [codexAuthMode, selectedAgent]
  )

  useEffect(() => {
    setSelectedSecretIds((previous) => {
      const filtered = previous.filter((id) => selectableSecretIds.has(id))
      return filtered.length === previous.length ? previous : filtered
    })
  }, [selectableSecretIds])

  function updateSkill(id: string, updates: Partial<SkillEntry>) {
    setSkills((previous) => previous.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)))
  }

  function removeSkill(id: string) {
    setSkills((previous) => previous.filter((entry) => entry.id !== id))
  }

  function addSkill() {
    setSkills((previous) => [...previous, createSkillEntry()])
  }

  async function handleAgentsUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith('.md')) {
      setError('AGENTS upload must be a .md file.')
      return
    }

    const content = await file.text()
    setAgentInstructions(content)
    setError(null)
    event.target.value = ''
  }

  async function handleSkillsUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) {
      return
    }

    const uploaded: SkillEntry[] = []
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.md')) {
        setError(`Skipped ${file.name}: only .md files are allowed for skills.`)
        continue
      }

      const content = await file.text()
      uploaded.push(createSkillEntry(skillPathFromUploadName(file.name), content))
    }

    if (uploaded.length > 0) {
      setSkills((previous) => [...previous, ...uploaded])
      setError(null)
    }

    event.target.value = ''
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const configFilesResult = buildConfigFiles(agentInstructions, skills)
    if (configFilesResult.error) {
      setError(configFilesResult.error)
      setIsSubmitting(false)
      return
    }

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
        qwenEndpoint,
        opencodeEndpoint,
        opencodeModel,
        geminiModel,
      },
    })

    try {
      const clanker = await createClanker({
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || null,
        deploymentStrategyId: selectedStrategyId || null,
        deploymentConfig,
        configFiles: configFilesResult.files,
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

      <form onSubmit={handleSubmit} className="mt-8 w-full max-w-6xl">
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
              <Input name="name" required placeholder="My Awesome Clanker" />
            </Field>

            <Field>
              <Label>Description</Label>
              <Description>A brief description of what this clanker does.</Description>
              <Textarea name="description" rows={3} placeholder="This clanker handles..." />
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
              <AgentSelectionCards value={selectedAgent} onChange={setSelectedAgent} />
            </Field>

            <AgentSpecificFields
              selectedAgent={selectedAgent}
              strategyName={selectedStrategy?.name}
              codexAuthMode={codexAuthMode}
              qwenEndpoint={qwenEndpoint}
              opencodeEndpoint={opencodeEndpoint}
              opencodeModel={opencodeModel}
              geminiModel={geminiModel}
              onCodexAuthModeChange={setCodexAuthMode}
              onQwenEndpointChange={setQwenEndpoint}
              onOpenCodeEndpointChange={setOpencodeEndpoint}
              onOpenCodeModelChange={setOpencodeModel}
              onGeminiModelChange={setGeminiModel}
            />

            <MultiSelect
              label="Secrets"
              description={secretPickerDescription}
              options={selectableSecrets.map((secret) => ({
                id: secret.id,
                label: secret.name,
                description: `${secret.secretLocation}${secret.secretPath ? ` - ${secret.secretPath}` : ''}`,
              }))}
              value={selectedSecretIds}
              onChange={setSelectedSecretIds}
              emptyMessage={secretPickerEmptyMessage}
              searchable={true}
            />
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
                  setSelectedStrategyId(strategyId)
                  setProvisioningMode('managed')
                }}
              />
            </Field>

            <StrategySpecificFields
              strategyName={selectedStrategy?.name}
              provisioningMode={provisioningMode}
              onProvisioningModeChange={setProvisioningMode}
              defaults={DEFAULT_CLANKER_CONFIG_FORM_STATE}
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
                    onChange={handleAgentsUpload}
                    className="hidden"
                  />
                  <Button type="button" outline onClick={() => agentsFileInputRef.current?.click()}>
                    Upload .md
                  </Button>
                </div>
              </div>
              <Description>Main instruction file used to guide this clanker.</Description>
              <Textarea
                rows={8}
                value={agentInstructions}
                onChange={(event) => setAgentInstructions(event.target.value)}
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
                    onChange={handleSkillsUpload}
                    className="hidden"
                  />
                  <Button type="button" outline onClick={() => skillsFileInputRef.current?.click()}>
                    Upload .md Files
                  </Button>
                  <Button type="button" outline onClick={addSkill}>
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
                      onChange={(event) => updateSkill(skill.id, { path: event.target.value })}
                      placeholder="skills/example.md"
                      className="font-mono"
                    />
                    <Button type="button" plain onClick={() => removeSkill(skill.id)}>
                      Remove
                    </Button>
                  </div>
                  <Textarea
                    rows={6}
                    value={skill.content}
                    onChange={(event) => updateSkill(skill.id, { content: event.target.value })}
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
