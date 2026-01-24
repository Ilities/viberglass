export enum ErrorClassification {
  TRANSIENT = 'transient', // Can be retried (throttling, network, server errors)
  PERMANENT = 'permanent', // Should not be retried (config, permission errors)
}

export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly classification: ErrorClassification,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'WorkerError';
  }

  get isTransient(): boolean {
    return this.classification === ErrorClassification.TRANSIENT;
  }

  get isPermanent(): boolean {
    return this.classification === ErrorClassification.PERMANENT;
  }
}
