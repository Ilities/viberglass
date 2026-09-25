import { PageMeta } from '@/components/page-meta'
import { Text } from '@/components/text'
import { useAuth } from '@/context/auth-context'
import { getSetupProviders, getSetupStatus, loadDemoWorkspace } from '@/service/api/setup-api'
import type { ModelProviderId, RepositoryAccess, SetupProvider, SetupStatus } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgentStep } from './AgentStep'
import { FirstTaskStep } from './FirstTaskStep'
import { ModelKeyStep } from './ModelKeyStep'
import { RepositoryStep } from './RepositoryStep'
import { SetupError } from './SetupFrame'
import { markSetupSkipped, readStoredRepository, resumeSetup, storeRepository, type SetupStep } from './setupResume'
import { SpaceStep } from './SpaceStep'

interface Loaded {
  status: SetupStatus
  providers: SetupProvider[]
}

/**
 * First-run setup (ADR 0003, J1): model key → repository → space → agent →
 * first task. Admin only; it resumes at the first step that isn't done.
 */
export function SetupPage() {
  const { user, status: authStatus } = useAuth()
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<SetupStep | null>(null)
  const [provider, setProvider] = useState<ModelProviderId | null>(null)
  const [repository, setRepository] = useState<RepositoryAccess | null>(readStoredRepository)
  const [space, setSpace] = useState<SetupStatus['space']>(null)
  const [agent, setAgent] = useState<SetupStatus['agent']>(null)
  const [clankerId, setClankerId] = useState<string | null>(null)

  useEffect(() => {
    if (authStatus === 'unauthenticated') navigate('/login?redirect=/setup', { replace: true })
    if (authStatus === 'authenticated' && user?.role !== 'admin') navigate('/', { replace: true })
  }, [authStatus, user, navigate])

  useEffect(() => {
    if (authStatus !== 'authenticated' || user?.role !== 'admin') return
    Promise.all([getSetupStatus(), getSetupProviders()])
      .then(([status, providers]) => {
        const resumed = resumeSetup(status, readStoredRepository())
        setLoaded({ status, providers })
        setProvider(resumed.provider)
        setSpace(status.space)
        setAgent(status.agent)
        setClankerId(status.agent?.status === 'active' ? status.agent.clankerId : null)
        setStep(resumed.step)
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Couldn't load setup."))
  }, [authStatus, user])

  const [demoError, setDemoError] = useState<string | null>(null)
  const [isLoadingDemo, setIsLoadingDemo] = useState(false)

  async function handleExploreDemo() {
    setDemoError(null)
    setIsLoadingDemo(true)
    try {
      const demo = await loadDemoWorkspace()
      navigate(`/project/${demo.slug}`)
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Couldn't load the demo workspace.")
      setIsLoadingDemo(false)
    }
  }

  const handleAgentReady = useCallback((id: string) => {
    setClankerId(id)
    setStep('task')
  }, [])

  if (loadError) return <SetupError message={loadError} />
  if (!loaded || !step) return <Text>Loading…</Text>

  return (
    <>
      <PageMeta title="Set up Viberglass" />
      <div className="grid w-full max-w-md gap-10">
        {step === 'model' && (
          <ModelKeyStep
            providers={loaded.providers}
            connectedProviders={loaded.status.connectedProviders}
            initialProvider={provider}
            onDone={(chosen) => {
              setProvider(chosen)
              setStep(space ? 'agent' : repository && loaded.status.repositoryConnected ? 'space' : 'repository')
            }}
          />
        )}
        {step === 'model' && (
          <div className="grid gap-3 border-t border-zinc-950/10 pt-6 dark:border-white/10">
            <SetupError message={demoError} />
            <Text>
              Want to look around first?{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => void handleExploreDemo()}
                disabled={isLoadingDemo}
              >
                {isLoadingDemo ? 'Loading the demo…' : 'Explore a demo workspace'}
              </button>{' '}
              with sample tasks at every stage. You can remove it later.
            </Text>
          </div>
        )}
        {step === 'repository' && (
          <RepositoryStep
            onDone={(checked) => {
              storeRepository(checked)
              setRepository(checked)
              setStep('space')
            }}
          />
        )}
        {step === 'space' && repository && provider && (
          <SpaceStep
            repository={repository}
            provider={provider}
            onChangeRepository={() => setStep('repository')}
            onDone={(created, started) => {
              setSpace(created)
              setAgent(started)
              setStep('agent')
            }}
          />
        )}
        {step === 'agent' && provider && <AgentStep provider={provider} agent={agent} onReady={handleAgentReady} />}
        {step === 'task' && space && clankerId && <FirstTaskStep space={space} clankerId={clankerId} />}
        {step !== 'task' && (
          <Text className="text-xs">
            Setting things up yourself?{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                markSetupSkipped()
                navigate('/')
              }}
            >
              Skip setup
            </button>
          </Text>
        )}
      </div>
    </>
  )
}
