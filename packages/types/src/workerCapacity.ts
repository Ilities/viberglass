/** How many Kubernetes workers may run at once; runs over the limit wait for one to finish. */
export interface WorkerCapacityStatus {
  /** Null is no limit. */
  maxRuns: number | null
  running: number
  waiting: number
}
