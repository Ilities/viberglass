import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { createClanker, getDeploymentStrategies } from '@/service/api/clanker-api'
import { getSecrets } from '@/service/api/secret-api'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClankerForm } from './components/ClankerForm'
import { buildClankerDeploymentConfig } from './config/buildConfig'
import { DEFAULT_CLANKER_CONFIG_FORM_STATE } from './config/types'
import { useClankerForm } from './config/useClankerForm'

export function NewClankerPage() {
  const navigate = useNavigate()
  const form = useClankerForm()

  useEffect(() => {
    async function loadData() {
      try {
        const [strategies, secretsData] = await Promise.all([getDeploymentStrategies(), getSecrets(100, 0)])
        form.setDeploymentStrategies(strategies)
        form.setSecrets(secretsData)
      } catch (err) {
        console.error('Failed to load data:', err)
      }
    }
    loadData()
  }, [form])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    form.setIsSubmitting(true)
    form.setError(null)

    const formData = new FormData(event.currentTarget)
    const configFilesResult = form.buildConfigFiles()
    if (configFilesResult.error) {
      form.setError(configFilesResult.error)
      form.setIsSubmitting(false)
      return
    }

    const deploymentConfig = buildClankerDeploymentConfig({
      strategyName: form.selectedStrategy?.name,
      selectedAgent: form.selectedAgent,
      form: {
        provisioningMode: form.provisioningMode,
        containerImage: ((formData.get('containerImage') as string) || '').trim(),
        clusterArn: ((formData.get('clusterArn') as string) || '').trim(),
        taskDefinitionArn: ((formData.get('taskDefinitionArn') as string) || '').trim(),
        functionArn: ((formData.get('functionArn') as string) || '').trim(),
        lambdaMemorySize: ((formData.get('lambdaMemorySize') as string) || '').trim(),
        lambdaTimeout: ((formData.get('lambdaTimeout') as string) || '').trim(),
        lambdaEphemeralStorage: ((formData.get('lambdaEphemeralStorage') as string) || '').trim(),
        codexAuthMode: form.codexAuthMode,
        qwenEndpoint: form.qwenEndpoint,
        opencodeEndpoint: form.opencodeEndpoint,
        opencodeModel: form.opencodeModel,
        geminiModel: form.geminiModel,
      },
    })

    try {
      const clanker = await createClanker({
        name: formData.get('name') as string,
        description: (formData.get('description') as string) || null,
        deploymentStrategyId: form.selectedStrategyId || null,
        deploymentConfig,
        configFiles: configFilesResult.files,
        agent: form.selectedAgent || null,
        secretIds: form.selectedSecretIds,
      })
      navigate(`/clankers/${clanker.slug}`)
    } catch (err) {
      form.setError(err instanceof Error ? err.message : 'Failed to create clanker')
      form.setIsSubmitting(false)
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

      <ClankerForm
        error={form.error}
        isSubmitting={form.isSubmitting}
        submitButtonText="Create Clanker"
        submittingButtonText="Creating..."
        selectedAgent={form.selectedAgent}
        onAgentChange={form.setSelectedAgent}
        codexAuthMode={form.codexAuthMode}
        onCodexAuthModeChange={form.setCodexAuthMode}
        qwenEndpoint={form.qwenEndpoint}
        onQwenEndpointChange={form.setQwenEndpoint}
        opencodeEndpoint={form.opencodeEndpoint}
        onOpenCodeEndpointChange={form.setOpencodeEndpoint}
        opencodeModel={form.opencodeModel}
        onOpenCodeModelChange={form.setOpencodeModel}
        geminiModel={form.geminiModel}
        onGeminiModelChange={form.setGeminiModel}
        nativeConfigEnabled={form.nativeConfigEnabled}
        nativeConfigPath={form.nativeConfigPath}
        nativeConfigContent={form.nativeConfigContent}
        nativeConfigFormat={form.nativeConfigFormat}
        onNativeConfigEnabledChange={form.setNativeConfigEnabled}
        onNativeConfigPathChange={form.setNativeConfigPath}
        onNativeConfigContentChange={form.setNativeConfigContent}
        onNativeConfigUploadClick={() => form.nativeConfigFileInputRef.current?.click()}
        onNativeConfigUpload={form.handleNativeConfigUpload}
        nativeConfigFileInputRef={form.nativeConfigFileInputRef}
        onLoadNativeConfigTemplate={() => form.loadNativeConfigTemplate(form.selectedAgent)}
        secrets={form.secrets}
        selectedSecretIds={form.selectedSecretIds}
        onSecretIdsChange={form.setSelectedSecretIds}
        showAllSecrets={form.showAllSecrets}
        onShowAllSecretsChange={form.setShowAllSecrets}
        selectableSecrets={form.selectableSecrets}
        secretPickerDescription={form.secretPickerDescription}
        secretPickerEmptyMessage={form.secretPickerEmptyMessage}
        deploymentStrategies={form.deploymentStrategies}
        selectedStrategyId={form.selectedStrategyId}
        onStrategyChange={form.setSelectedStrategyId}
        provisioningMode={form.provisioningMode}
        onProvisioningModeChange={form.setProvisioningMode}
        strategyDefaults={DEFAULT_CLANKER_CONFIG_FORM_STATE}
        agentInstructions={form.agentInstructions}
        onAgentInstructionsChange={form.setAgentInstructions}
        skills={form.skills}
        onSkillUpdate={form.updateSkill}
        onSkillRemove={form.removeSkill}
        onAddSkill={form.addSkill}
        onAgentsUploadClick={() => form.agentsFileInputRef.current?.click()}
        onSkillsUploadClick={() => form.skillsFileInputRef.current?.click()}
        agentsFileInputRef={form.agentsFileInputRef}
        skillsFileInputRef={form.skillsFileInputRef}
        onAgentsUpload={form.handleAgentsUpload}
        onSkillsUpload={form.handleSkillsUpload}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
      />
    </>
  )
}
