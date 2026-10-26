/** Fargate task CPU units, 1024 to a vCPU. */
export const FARGATE_CPU_UNITS = ["256", "512", "1024", "2048", "4096", "8192", "16384"] as const;

const MEMORY_RANGES: Record<string, { from: number; to: number; step: number } | number[]> = {
  "256": [512, 1024, 2048],
  "512": { from: 1024, to: 4096, step: 1024 },
  "1024": { from: 2048, to: 8192, step: 1024 },
  "2048": { from: 4096, to: 16384, step: 1024 },
  "4096": { from: 8192, to: 30720, step: 1024 },
  "8192": { from: 16384, to: 61440, step: 4096 },
  "16384": { from: 32768, to: 122880, step: 8192 },
};

/** The memory sizes, in MiB, Fargate allows with `cpu` units. */
export function fargateMemoryOptions(cpu: string): string[] {
  const range = MEMORY_RANGES[cpu];
  if (!range) return [];
  if (Array.isArray(range)) return range.map(String);
  const sizes: string[] = [];
  for (let mib = range.from; mib <= range.to; mib += range.step) sizes.push(String(mib));
  return sizes;
}

/** Why Fargate would refuse this CPU and memory pair, or null when it's one it runs. */
export function fargateSizeProblem(cpu: string | undefined, memory: string | undefined): string | null {
  if (!cpu && !memory) return null;
  if (!cpu || !memory) return "Set both CPU and memory for an ECS runner, or neither.";
  if (!fargateMemoryOptions(cpu).includes(memory)) {
    return `ECS can't run ${memory} MiB of memory with ${cpu} CPU units.`;
  }
  return null;
}
