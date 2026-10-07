import type { ModelDeploymentView } from '@viberglass/types'
import { deploymentState, formatServingArgs, parseServingArgs, recipeHardwareFor, withGpuCount } from './deploymentDisplay'

const deployment: ModelDeploymentView = {
  id: 'd',
  name: 'Qwen',
  accountId: 'a',
  host: 'verda',
  model: 'Qwen/Qwen3-8B',
  flavour: { id: 'L40S', gpuCount: 1 },
  servingArgs: [],
  mode: 'scale-to-zero',
  endpointId: 'e',
  createdAt: '',
  updatedAt: '',
  status: { state: 'idle' },
  pricePerHour: 1.52,
  currency: 'EUR',
  runners: [],
}

describe('deployment display', () => {
  it('names the state from the cloud and the mode', () => {
    expect(deploymentState(deployment).label).toBe('Idle · scaled to zero')
    expect(deploymentState({ ...deployment, mode: 'keep-warm', status: { state: 'running' } }).label).toMatch(/^Kept warm · .*1\.52.*\/h$/)
    expect(deploymentState({ ...deployment, mode: 'stopped', status: { state: 'idle' } }).label).toBe('Stopped')
    expect(deploymentState({ ...deployment, status: { state: 'failed', detail: 'quota' } }).color).toBe('red')
  })

  it('reads one option per line, splitting the flag from a value that keeps its spaces', () => {
    expect(
      parseServingArgs('--speculative-config {"a": 1}\n\n  --enable-auto-tool-choice  \n--max-model-len\n32768\n--tool-call-parser   qwen3-xml'),
    ).toEqual([
      '--speculative-config',
      '{"a": 1}',
      '--enable-auto-tool-choice',
      '--max-model-len',
      '32768',
      '--tool-call-parser',
      'qwen3-xml',
    ])
  })

  it('lays out each flag with its value, and reads that layout back unchanged', () => {
    const args = ['--enable-auto-tool-choice', '--tool-call-parser', 'qwen3-xml', '--kv-cache-dtype=fp8', '--speculative-config', '{"a": 1}']
    const text = formatServingArgs(args)
    expect(text).toBe('--enable-auto-tool-choice\n--tool-call-parser qwen3-xml\n--kv-cache-dtype=fp8\n--speculative-config {"a": 1}')
    expect(parseServingArgs(text)).toEqual(args)
  })

  it('matches tensor parallelism to the GPU count', () => {
    expect(withGpuCount(['--tensor-parallel-size', '1', '--x'], 2)).toEqual(['--tensor-parallel-size', '2', '--x'])
    expect(withGpuCount(['--x'], 2)).toEqual(['--x'])
  })

  it("uses a recipe's multi-GPU hardware entry when it has one", () => {
    const flavour = {
      id: 'RTX PRO 6000',
      gpuCount: 2,
      gpu: 'RTX PRO 6000 96GB',
      vramGb: 192,
      pricePerHour: 4.06,
      currency: 'EUR',
      available: true,
      recipeHardware: 'rtx_pro_6000',
    }
    expect(recipeHardwareFor(flavour, ['rtx_pro_6000', 'rtx_pro_6000_2x'])).toBe('rtx_pro_6000_2x')
    expect(recipeHardwareFor(flavour, ['rtx_pro_6000'])).toBe('rtx_pro_6000')
    expect(recipeHardwareFor(flavour, ['h100'])).toBeNull()
    expect(recipeHardwareFor({ ...flavour, recipeHardware: null }, ['rtx_pro_6000'])).toBeNull()
  })
})
