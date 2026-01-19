import { WorkerInvoker, WorkerType } from './WorkerInvoker';

export interface WorkerInvokerConfig {
  lambda?: { region?: string };
  ecs?: { region?: string };
  docker?: { socketPath?: string; host?: string; port?: number };
}

export class WorkerInvokerFactory {
  private invokers: Map<WorkerType, WorkerInvoker> = new Map();

  constructor(config: WorkerInvokerConfig = {}) {
    this.initializeInvokers(config);
  }

  private initializeInvokers(config: WorkerInvokerConfig): void {
    // Invokers will be registered by Plans 02 and 03
    // For now, log that factory is ready for invoker registration
    console.info('[WorkerInvokerFactory] Initialized (invokers pending)');
  }

  registerInvoker(type: WorkerType, invoker: WorkerInvoker): void {
    this.invokers.set(type, invoker);
    console.info(`[WorkerInvokerFactory] Registered ${type} invoker`);
  }

  getInvoker(workerType: WorkerType): WorkerInvoker {
    const invoker = this.invokers.get(workerType);
    if (!invoker) {
      throw new Error(
        `Worker type '${workerType}' not registered. Available: ${Array.from(this.invokers.keys()).join(', ') || 'none'}`
      );
    }
    return invoker;
  }

  getInvokerForClanker(clanker: { deploymentStrategy?: { name: string } | null }): WorkerInvoker {
    const strategyName = clanker.deploymentStrategy?.name?.toLowerCase() as WorkerType;
    if (!strategyName) {
      throw new Error('Clanker has no deployment strategy');
    }
    return this.getInvoker(strategyName);
  }

  getRegisteredTypes(): WorkerType[] {
    return Array.from(this.invokers.keys());
  }
}

// Singleton
let factoryInstance: WorkerInvokerFactory | null = null;

export function getWorkerInvokerFactory(config?: WorkerInvokerConfig): WorkerInvokerFactory {
  if (!factoryInstance) {
    factoryInstance = new WorkerInvokerFactory(config);
  }
  return factoryInstance;
}

// For testing - reset singleton
export function resetWorkerInvokerFactory(): void {
  factoryInstance = null;
}
