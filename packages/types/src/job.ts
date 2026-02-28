export const JOB_KIND = {
  RESEARCH: 'research',
  EXECUTION: 'execution',
} as const

export type JobKind = (typeof JOB_KIND)[keyof typeof JOB_KIND]
