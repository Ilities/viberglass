import type { ModelHostFlavour } from '@viberglass/types'

/** Verda GPU models that vLLM Recipes lists hardware for. */
const RECIPE_HARDWARE: Record<string, string> = {
  H100: 'h100',
  H200: 'h200',
  B200: 'b200',
  B300: 'b300',
  'RTX PRO 6000': 'rtx_pro_6000',
  L40S: 'l40s',
}

export interface VerdaComputeResource {
  name: string
  size: number
  is_available: boolean
}

export interface VerdaContainerType {
  model: string
  name: string
  gpu: { number_of_gpus: number }
  gpu_memory: { size_in_gigabytes: number }
  serverless_price: string | number
  currency: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readComputeResources(value: unknown): VerdaComputeResource[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown) =>
    isRecord(entry) && typeof entry.name === 'string' && typeof entry.size === 'number'
      ? [{ name: entry.name, size: entry.size, is_available: entry.is_available === true }]
      : [],
  )
}

export function readContainerTypes(value: unknown): VerdaContainerType[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown) => {
    if (
      !isRecord(entry) ||
      typeof entry.model !== 'string' ||
      typeof entry.name !== 'string' ||
      !isRecord(entry.gpu) ||
      typeof entry.gpu.number_of_gpus !== 'number' ||
      !isRecord(entry.gpu_memory) ||
      typeof entry.gpu_memory.size_in_gigabytes !== 'number'
    )
      return []
    const price = entry.serverless_price
    return [
      {
        model: entry.model,
        name: entry.name,
        gpu: { number_of_gpus: entry.gpu.number_of_gpus },
        gpu_memory: { size_in_gigabytes: entry.gpu_memory.size_in_gigabytes },
        serverless_price: typeof price === 'number' || typeof price === 'string' ? price : '',
        currency: typeof entry.currency === 'string' ? entry.currency : '',
      },
    ]
  })
}

/** GPU flavours with prices: the account's compute resources joined to the public price list. */
export function verdaFlavours(
  resources: VerdaComputeResource[],
  types: VerdaContainerType[],
): ModelHostFlavour[] {
  // CPU nodes are listed too, with `size` counting vCPUs; they can't serve a model.
  const cpuOnly = new Set(types.filter((type) => type.gpu.number_of_gpus === 0).map((type) => type.model))
  return resources
    .filter((resource) => resource.size > 0 && !cpuOnly.has(resource.name))
    .map((resource) => {
      const type = types.find(
        (candidate) =>
          candidate.gpu.number_of_gpus === resource.size &&
          (candidate.model === resource.name || candidate.name === resource.name),
      )
      const price = type ? Number(type.serverless_price) : NaN
      return {
        id: resource.name,
        gpuCount: resource.size,
        gpu: type?.name ?? resource.name,
        vramGb: type?.gpu_memory.size_in_gigabytes ?? 0,
        pricePerHour: Number.isFinite(price) ? price : null,
        currency: type?.currency.toUpperCase() || null,
        available: resource.is_available,
        recipeHardware: RECIPE_HARDWARE[type?.model ?? resource.name] ?? null,
      }
    })
    .sort((a, b) => (a.pricePerHour ?? Infinity) - (b.pricePerHour ?? Infinity))
}
