import { CheckCircledIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'
import { AGENT_OPTIONS, type AgentType, type DeploymentStrategy } from '@viberglass/types'

interface StrategyVisual {
  logoPath: string
  logoAlt: string
  summary: string
}

function toTitleCase(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function getStrategyVisual(strategyName: string): StrategyVisual {
  const normalized = strategyName.trim().toLowerCase()
  if (normalized === 'kubernetes') {
    return { logoPath: '/logos/viberglass.svg', logoAlt: 'Kubernetes worker', summary: 'Runs each task as a Job in your configured Kubernetes cluster.' }
  }

  if (normalized === 'ecs') {
    return {
      logoPath: '/logos/strategies/ecs.svg',
      logoAlt: 'AWS ECS logo',
      summary: 'Runs work as ECS tasks with managed or pre-built resources.',
    }
  }

  if (normalized === 'aws-lambda-container' || normalized === 'lambda') {
    return {
      logoPath: '/logos/strategies/lambda.svg',
      logoAlt: 'AWS Lambda logo',
      summary: 'Invokes container-based Lambda functions for bursty workloads.',
    }
  }

  return {
    logoPath: '/logos/strategies/docker.svg',
    logoAlt: 'Docker logo',
    summary: 'Runs work in a Docker image, ideal for local or custom infrastructure.',
  }
}

export function AgentSelectionCards({
  value,
  onChange,
}: {
  value: AgentType | ''
  onChange: (agent: AgentType) => void
}) {
  return (
    <div data-slot="control">
      <input type="hidden" name="agent" value={value} />
      <div role="radiogroup" aria-label="Agent selection" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {AGENT_OPTIONS.map((option) => {
          const selected = value === option.value

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={clsx(
                'rounded-xl border p-4 text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-burnt-orange/60',
                selected
                  ? 'border-brand-burnt-orange/60 bg-brand-burnt-orange/5 dark:border-brand-burnt-orange/50 dark:bg-brand-burnt-orange/10'
                  : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white p-1.5 dark:border-zinc-700 dark:bg-zinc-950">
                    <img src={option.logo ?? '/logos/viberglass.svg'} alt={`${option.label} logo`} className="h-full w-full object-contain" />
                  </span>
                  <p className="text-sm font-semibold text-zinc-950 dark:text-white">{option.label}</p>
                </div>
                {selected && <CheckCircledIcon className="h-5 w-5 text-brand-burnt-orange" aria-hidden="true" />}
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{option.description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DeploymentStrategyCards({
  strategies,
  value,
  onChange,
}: {
  strategies: DeploymentStrategy[]
  value: string
  onChange: (strategyId: string) => void
}) {
  return (
    <div data-slot="control">
      <input type="hidden" name="deploymentStrategyId" value={value} />
      {strategies.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          No deployment strategies available yet.
        </div>
      ) : (
        <div role="radiogroup" aria-label="Deployment strategy selection" className="grid gap-3 sm:grid-cols-3">
          {strategies.map((strategy) => {
            const selected = strategy.id === value
            const visual = getStrategyVisual(strategy.name)

            return (
              <button
                key={strategy.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(strategy.id)}
                className={clsx(
                  'rounded-xl border p-4 text-left transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-burnt-orange/60',
                  selected
                    ? 'border-brand-burnt-orange/60 bg-brand-burnt-orange/5 dark:border-brand-burnt-orange/50 dark:bg-brand-burnt-orange/10'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-white p-1.5 dark:border-zinc-700 dark:bg-zinc-950">
                    <img src={visual.logoPath} alt={visual.logoAlt} className="h-full w-full object-contain" />
                  </span>
                  {selected && <CheckCircledIcon className="h-5 w-5 text-brand-burnt-orange" aria-hidden="true" />}
                </div>
                <p className="mt-3 text-sm font-semibold text-zinc-950 dark:text-white">{toTitleCase(strategy.name)}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {strategy.description || visual.summary}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
