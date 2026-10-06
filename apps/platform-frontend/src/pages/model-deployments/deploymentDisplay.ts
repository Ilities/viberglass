import type { ModelDeploymentView, ModelHostFlavour } from '@viberglass/types'

type BadgeColor = 'green' | 'sky' | 'amber' | 'red' | 'zinc'

export function formatPrice(price: number | null, currency: string | null): string | null {
  if (price === null) return null
  const amount = new Intl.NumberFormat(undefined, {
    style: currency ? 'currency' : 'decimal',
    ...(currency ? { currency } : {}),
    minimumFractionDigits: 2,
  }).format(price)
  return `${amount}/h`
}

export function flavourLabel(flavour: ModelHostFlavour): string {
  const price = formatPrice(flavour.pricePerHour, flavour.currency)
  const gpus = flavour.gpuCount === 1 ? flavour.gpu : `${flavour.gpuCount} × ${flavour.gpu}`
  return price ? `${gpus} · ${price}` : gpus
}

/** What the row says about the deployment, from the cloud's state and the mode we set. */
export function deploymentState(deployment: ModelDeploymentView): { label: string; color: BadgeColor } {
  const { state } = deployment.status
  if (state === 'failed') return { label: 'Failed', color: 'red' }
  if (state === 'unknown') return { label: 'Unknown', color: 'zinc' }
  if (state === 'stopped' || deployment.mode === 'stopped') return { label: 'Stopped', color: 'zinc' }
  if (state === 'creating') return { label: 'Creating', color: 'amber' }
  if (state === 'waking') return { label: 'Waking', color: 'amber' }
  if (state === 'running') {
    const price = formatPrice(deployment.pricePerHour, deployment.currency)
    if (deployment.mode === 'keep-warm') return { label: price ? `Kept warm · ${price}` : 'Kept warm', color: 'green' }
    return { label: 'Running', color: 'green' }
  }
  return { label: 'Idle · scaled to zero', color: 'sky' }
}

/** The recipe's hardware key for this GPU setup: its multi-GPU entry when it has one, else the card's. */
export function recipeHardwareFor(flavour: ModelHostFlavour, recipeHardware: string[]): string | null {
  if (!flavour.recipeHardware) return null
  const candidates = [`${flavour.recipeHardware}_${flavour.gpuCount}x`, flavour.recipeHardware]
  return candidates.find((key) => recipeHardware.includes(key)) ?? null
}

/** Deployments whose state changes on its own soon, so the page should look again. */
export function isSettling(deployment: ModelDeploymentView): boolean {
  return deployment.status.state === 'creating' || deployment.status.state === 'waking'
}

/** Serving arguments are edited one per line, so values may contain spaces. */
export function parseServingArgs(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Matches tensor parallelism to the GPUs picked, when the arguments set it. */
export function withGpuCount(args: string[], gpuCount: number): string[] {
  const index = args.indexOf('--tensor-parallel-size')
  if (index < 0 || index + 1 >= args.length) return args
  return [...args.slice(0, index + 1), String(gpuCount), ...args.slice(index + 2)]
}

/** Defaults for a model vLLM Recipes doesn't cover: tool calls in the format most coding models use. */
export const GENERIC_SERVING_ARGS = ['--enable-auto-tool-choice', '--tool-call-parser', 'hermes', '--max-model-len', '32768']
