import { WorkerInvoker, WorkerType } from './WorkerInvoker';
import { LambdaInvoker } from './invokers/LambdaInvoker';
import { EcsInvoker } from './invokers/EcsInvoker';
import { DockerInvoker } from './invokers/DockerInvoker';

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
    // Initialize all invoker types
    this.invokers.set('lambda', new LambdaInvoker(config.lambda));
    this.invokers.set('ecs', new EcsInvoker(config.ecs));
    this.invokers.set('docker', new DockerInvoker(config.docker));

    console.info('[WorkerInvokerFactory] Initialized invokers:', {
      types: Array.from(this.invokers.keys()),
    });
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
