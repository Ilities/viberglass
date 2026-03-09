export const JOB_KIND = {
  RESEARCH: 'research',
  PLANNING: 'planning',
  EXECUTION: 'execution',
  CLAW: 'claw',
} as const

export type JobKind = (typeof JOB_KIND)[keyof typeof JOB_KIND]
