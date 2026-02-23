import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { MultiSelect } from '@/components/multi-select'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { getClankerBySlug } from '@/data'
import { getDeploymentStrategies, updateClanker } from '@/service/api/clanker-api'
import { getSecrets, type Secret } from '@/service/api/secret-api'
import {
  AGENT_OPTIONS,
  DEFAULT_AGENT_TYPE,
  type AgentType,
  type Clanker,
  type CodexAuthMode,
  type ConfigFileInput,
  type DeploymentStrategy,
} from '@viberglass/types'
import { AgentSpecificFields } from './config/agents'
import {
  filterSecretsForAgent,
  getSecretPickerDescription,
  getSecretPickerEmptyMessage,
} from './config/agentSecrets'
import { buildClankerDeploymentConfig } from './config/buildConfig'
import { toAgentType } from './config/normalizers'
import { readClankerDeploymentConfig } from './config/readConfig'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './config/types'
import { StrategySpecificFields } from './config/strategies'
import {
  AGENTS_FILE_TYPE,
  isSkillPath,
  normalizeInstructionPath,
  skillPathFromUploadName,
} from './instructionFiles'

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

function buildConfigFiles(agentInstructions: string, skills: SkillEntry[]): { files: ConfigFileInput[]; error: string | null } {
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

export function EditClankerPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [clanker, setClanker] = useState<Clanker | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deploymentStrategies, setDeploymentStrategies] = useState<DeploymentStrategy[]>([])
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('')
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [selectedAgent, setSelectedAgent] = useState<AgentType | ''>('')
  const [selectedSecretIds, setSelectedSecretIds] = useState<string[]>([])
  const [provisioningMode, setProvisioningMode] = useState<'managed' | 'prebuilt'>('managed')
  const [codexAuthMode, setCodexAuthMode] = useState<CodexAuthMode>(DEFAULT_CLANKER_CONFIG_FORM_STATE.codexAuthMode)
  const [qwenEndpoint, setQwenEndpoint] = useState(DEFAULT_CLANKER_CONFIG_FORM_STATE.qwenEndpoint)
  const [agentInstructions, setAgentInstructions] = useState('')
  const [skills, setSkills] = useState<SkillEntry[]>([])

  const agentsFileInputRef = useRef<HTMLInputElement | null>(null)
  const skillsFileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!slug) return

      const [clankerData, strategies, secretsData] = await Promise.all([
        getClankerBySlug(slug),
        getDeploymentStrategies(),
        getSecrets(100, 0),
      ])

      if (!clankerData) {
        return
      }

      setClanker(clankerData)
      setDeploymentStrategies(strategies)
      setSecrets(secretsData)
      setSelectedStrategyId(clankerData.deploymentStrategyId || '')
      setSelectedAgent(clankerData.agent || DEFAULT_AGENT_TYPE)
      setSelectedSecretIds(clankerData.secretIds || [])

      const parsedConfig = readClankerDeploymentConfig({
        deploymentConfig: clankerData.deploymentConfig,
        agent: clankerData.agent,
      })
      setProvisioningMode(parsedConfig.form.provisioningMode)
      setCodexAuthMode(parsedConfig.form.codexAuthMode)
      setQwenEndpoint(parsedConfig.form.qwenEndpoint)

      const loadedSkills: SkillEntry[] = []
      for (const file of clankerData.configFiles) {
        if (file.fileType === AGENTS_FILE_TYPE) {
          setAgentInstructions(file.content)
          continue
        }

        if (isSkillPath(file.fileType)) {
          loadedSkills.push(createSkillEntry(file.fileType, file.content))
        }
      }

      setSkills(loadedSkills)
      setIsLoading(false)
    }

    loadData()
  }, [slug])

  const selectedStrategy = deploymentStrategies.find((strategy) => strategy.id === selectedStrategyId)
  const selectableSecrets = useMemo(
    () => filterSecretsForAgent(secrets, selectedAgent, codexAuthMode),
    [codexAuthMode, secrets, selectedAgent],
  )
  const selectableSecretIds = useMemo(() => new Set(selectableSecrets.map((secret) => secret.id)), [selectableSecrets])
  const secretPickerDescription = useMemo(
    () => getSecretPickerDescription(selectedAgent, codexAuthMode),
    [codexAuthMode, selectedAgent],
  )
  const secretPickerEmptyMessage = useMemo(
    () => getSecretPickerEmptyMessage(selectedAgent, codexAuthMode),
    [codexAuthMode, selectedAgent],
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
    if (!clanker) return

    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const configFilesResult = buildConfigFiles(agentInstructions, skills)
    if (configFilesResult.error) {
      setError(configFilesResult.error)
      setIsSubmitting(false)
      return
    }

    const newDeploymentConfig = buildClankerDeploymentConfig({
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
      },
    })

    try {
      const updated = await updateClanker(clanker.id, {
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || null,
        deploymentStrategyId: selectedStrategyId || null,
        deploymentConfig: newDeploymentConfig,
        configFiles: configFilesResult.files,
        agent: selectedAgent || null,
        secretIds: selectedSecretIds,
      })
      navigate(`/clankers/${updated.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update clanker')
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
      </div>
    )
  }

  if (!clanker) {
    return null
  }

  const parsedDeploymentForm = readClankerDeploymentConfig({
    deploymentConfig: clanker.deploymentConfig,
    agent: clanker.agent,
  }).form

  return (
    <>
      <PageMeta title={clanker ? `Edit ${clanker.name}` : 'Edit Clanker'} />
      <Heading>Edit Clanker</Heading>
      <Subheading className="mt-2">Update the configuration for {clanker.name}.</Subheading>

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
              <Input name="name" required defaultValue={clanker.name} />
            </Field>

            <Field>
              <Label>Description</Label>
              <Description>A brief description of what this clanker does.</Description>
              <Textarea name="description" rows={3} defaultValue={clanker.description || ''} />
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
              defaults={parsedDeploymentForm}
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
              qwenEndpoint={qwenEndpoint}
              onCodexAuthModeChange={setCodexAuthMode}
              onQwenEndpointChange={setQwenEndpoint}
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
          <legend className="text-base/6 font-semibold text-zinc-950 dark:text-white">Instruction Files</legend>
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
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button type="button" plain onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  )
}
