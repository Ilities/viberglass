import type { Secret } from '@/service/api/secret-api'
import {
  DEFAULT_AGENT_TYPE,
  getNativeAgentConfigDefinition,
  isSupportedNativeAgentConfigAgent,
  type AgentType,
  type Clanker,
  type CodexAuthMode,
  type DeploymentStrategy,
  type NativeAgentConfigFormat,
} from '@viberglass/types'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { AGENTS_FILE_TYPE, isSkillPath, normalizeInstructionPath, skillPathFromUploadName } from '../instructionFiles'
import { getNativeAgentConfigTemplate } from '@/service/api/clanker-api'
import {
  filterSecretsForAgent,
  getAllSecrets,
  getSecretPickerDescription,
  getSecretPickerEmptyMessage,
} from './agentSecrets'
import { isAllowedNativeAgentConfigPath } from './nativeAgentConfig'
import type { ConfigFilesResult, SkillEntry } from './types'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './types'

function createSkillEntry(path: string = 'skills/new-skill.md', content = ''): SkillEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    path,
    content,
  }
}

function buildConfigFiles(
  agentInstructions: string,
  skills: SkillEntry[],
  nativeAgentConfig: {
    enabled: boolean
    path: string
    content: string
    format: NativeAgentConfigFormat | null
  },
  agent: AgentType | '',
): ConfigFilesResult {
  const files: import('@viberglass/types').ConfigFileInput[] = []

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

  if (nativeAgentConfig.enabled) {
    if (!isSupportedNativeAgentConfigAgent(agent)) {
      return {
        files: [],
        error: `Agent "${agent || 'unknown'}" does not support native config files.`,
      }
    }

    const normalizedPath = normalizeInstructionPath(nativeAgentConfig.path)
    if (!isAllowedNativeAgentConfigPath(agent, normalizedPath)) {
      return {
        files: [],
        error: `Invalid native config path "${nativeAgentConfig.path}".`,
      }
    }

    if (!nativeAgentConfig.content.trim()) {
      return {
        files: [],
        error: 'Native config content cannot be empty.',
      }
    }

    files.push({
      fileType: normalizedPath,
      content: nativeAgentConfig.content,
    })
  }

  return { files, error: null }
}

export interface UseClankerFormOptions {
  initialClanker?: Clanker | null
}

export interface UseClankerFormReturn {
  isSubmitting: boolean
  error: string | null
  deploymentStrategies: DeploymentStrategy[]
  selectedStrategyId: string
  secrets: Secret[]
  selectedAgent: AgentType | ''
  selectedSecretIds: string[]
  provisioningMode: 'managed' | 'prebuilt'
  codexAuthMode: CodexAuthMode
  qwenEndpoint: string
  opencodeEndpoint: string
  opencodeModel: string
  geminiModel: string
  agentInstructions: string
  skills: SkillEntry[]
  nativeConfigEnabled: boolean
  nativeConfigPath: string
  nativeConfigContent: string
  nativeConfigFormat: NativeAgentConfigFormat | null
  showAllSecrets: boolean
  agentsFileInputRef: React.RefObject<HTMLInputElement | null>
  skillsFileInputRef: React.RefObject<HTMLInputElement | null>
  nativeConfigFileInputRef: React.RefObject<HTMLInputElement | null>
  selectedStrategy: DeploymentStrategy | undefined
  selectableSecrets: Secret[]
  selectableSecretIds: Set<string>
  secretPickerDescription: string
  secretPickerEmptyMessage: string
  setError: (error: string | null) => void
  setDeploymentStrategies: (strategies: DeploymentStrategy[]) => void
  setSecrets: (secrets: Secret[]) => void
  setIsSubmitting: (isSubmitting: boolean) => void
  setSelectedStrategyId: (id: string) => void
  setSelectedAgent: (agent: AgentType | '') => void
  setSelectedSecretIds: (ids: string[]) => void
  setProvisioningMode: (mode: 'managed' | 'prebuilt') => void
  setCodexAuthMode: (mode: CodexAuthMode) => void
  setQwenEndpoint: (endpoint: string) => void
  setOpencodeEndpoint: (endpoint: string) => void
  setOpencodeModel: (model: string) => void
  setGeminiModel: (model: string) => void
  setAgentInstructions: (instructions: string) => void
  setSkills: (skills: SkillEntry[]) => void
  setNativeConfigEnabled: (enabled: boolean) => void
  setNativeConfigPath: (path: string) => void
  setNativeConfigContent: (content: string) => void
  setShowAllSecrets: (show: boolean) => void
  updateSkill: (id: string, updates: Partial<SkillEntry>) => void
  removeSkill: (id: string) => void
  addSkill: () => void
  handleAgentsUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  handleSkillsUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  handleNativeConfigUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
  loadNativeConfigTemplate: (agent: AgentType | '', clankerId?: string) => Promise<void>
  buildConfigFiles: () => ConfigFilesResult
  resetForm: (clanker: Clanker) => void
}

export function useClankerForm(): UseClankerFormReturn {
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
  const [nativeConfigEnabled, setNativeConfigEnabled] = useState(false)
  const [nativeConfigPath, setNativeConfigPath] = useState('')
  const [nativeConfigContent, setNativeConfigContent] = useState('')
  const [nativeConfigFormat, setNativeConfigFormat] = useState<NativeAgentConfigFormat | null>(null)
  const [showAllSecrets, setShowAllSecrets] = useState(false)

  const agentsFileInputRef = useRef<HTMLInputElement | null>(null)
  const skillsFileInputRef = useRef<HTMLInputElement | null>(null)
  const nativeConfigFileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedStrategy = deploymentStrategies.find((strategy) => strategy.id === selectedStrategyId)
  const selectableSecrets = useMemo(
    () => (showAllSecrets ? getAllSecrets(secrets) : filterSecretsForAgent(secrets, selectedAgent, codexAuthMode)),
    [codexAuthMode, secrets, selectedAgent, showAllSecrets]
  )
  const selectableSecretIds = useMemo(() => new Set(selectableSecrets.map((secret) => secret.id)), [selectableSecrets])
  const secretPickerDescription = useMemo(
    () => getSecretPickerDescription(selectedAgent, codexAuthMode, showAllSecrets),
    [codexAuthMode, selectedAgent, showAllSecrets]
  )
  const secretPickerEmptyMessage = useMemo(
    () => getSecretPickerEmptyMessage(selectedAgent, codexAuthMode, showAllSecrets),
    [codexAuthMode, selectedAgent, showAllSecrets]
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

  async function loadNativeConfigTemplate(agent: AgentType | '', clankerId?: string) {
    if (!isSupportedNativeAgentConfigAgent(agent)) {
      setNativeConfigEnabled(false)
      setNativeConfigPath('')
      setNativeConfigContent('')
      setNativeConfigFormat(null)
      return
    }

    const template = await getNativeAgentConfigTemplate(agent, clankerId)
    setNativeConfigEnabled(true)
    setNativeConfigPath(template.defaultPath)
    setNativeConfigContent(template.content)
    setNativeConfigFormat(template.format)
    setError(null)
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

  async function handleNativeConfigUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const definition = getNativeAgentConfigDefinition(selectedAgent)
    const expectedExtension = definition?.format === 'toml' ? '.toml' : '.json'
    if (!definition || !file.name.toLowerCase().endsWith(expectedExtension)) {
      setError(`Native config upload must be a ${expectedExtension} file.`)
      return
    }

    const content = await file.text()
    setNativeConfigEnabled(true)
    setNativeConfigContent(content)
    setNativeConfigFormat(definition.format)
    if (!nativeConfigPath) {
      setNativeConfigPath(definition.defaultPath)
    }
    setError(null)
    event.target.value = ''
  }

  function getConfigFilesResult(): ConfigFilesResult {
    return buildConfigFiles(
      agentInstructions,
      skills,
      {
        enabled: nativeConfigEnabled,
        path: nativeConfigPath,
        content: nativeConfigContent,
        format: nativeConfigFormat,
      },
      selectedAgent,
    )
  }

  function resetForm(clanker: Clanker) {
    setSelectedStrategyId(clanker.deploymentStrategyId || '')
    setSelectedAgent(clanker.agent || DEFAULT_AGENT_TYPE)
    setSelectedSecretIds(clanker.secretIds || [])
  }

  useEffect(() => {
    if (isSupportedNativeAgentConfigAgent(selectedAgent)) {
      const definition = getNativeAgentConfigDefinition(selectedAgent)
      if (!definition) {
        return
      }

      if (nativeConfigFormat !== definition.format) {
        setNativeConfigFormat(definition.format)
      }

      if (!nativeConfigPath) {
        setNativeConfigPath(definition.defaultPath)
        return
      }

      if (!isAllowedNativeAgentConfigPath(selectedAgent, nativeConfigPath)) {
        setNativeConfigEnabled(false)
        setNativeConfigPath(definition.defaultPath)
        setNativeConfigContent('')
      }
      return
    }

    setNativeConfigEnabled(false)
    setNativeConfigPath('')
    setNativeConfigContent('')
    setNativeConfigFormat(null)
  }, [nativeConfigFormat, nativeConfigPath, selectedAgent])

  return {
    isSubmitting,
    error,
    deploymentStrategies,
    selectedStrategyId,
    secrets,
    selectedAgent,
    selectedSecretIds,
    provisioningMode,
    codexAuthMode,
    qwenEndpoint,
    opencodeEndpoint,
    opencodeModel,
    geminiModel,
    agentInstructions,
    skills,
    nativeConfigEnabled,
    nativeConfigPath,
    nativeConfigContent,
    nativeConfigFormat,
    showAllSecrets,
    agentsFileInputRef,
    skillsFileInputRef,
    nativeConfigFileInputRef,
    selectedStrategy,
    selectableSecrets,
    selectableSecretIds,
    secretPickerDescription,
    secretPickerEmptyMessage,
    setError,
    setDeploymentStrategies,
    setSecrets,
    setIsSubmitting,
    setSelectedStrategyId,
    setSelectedAgent,
    setSelectedSecretIds,
    setProvisioningMode,
    setCodexAuthMode,
    setQwenEndpoint,
    setOpencodeEndpoint,
    setOpencodeModel,
    setGeminiModel,
    setAgentInstructions,
    setSkills,
    setNativeConfigEnabled,
    setNativeConfigPath,
    setNativeConfigContent,
    setShowAllSecrets,
    updateSkill,
    removeSkill,
    addSkill,
    handleAgentsUpload,
    handleSkillsUpload,
    handleNativeConfigUpload,
    loadNativeConfigTemplate,
    buildConfigFiles: getConfigFilesResult,
    resetForm,
  }
}
