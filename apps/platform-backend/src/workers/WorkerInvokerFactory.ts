import { WorkerInvoker, WorkerType } from './WorkerInvoker';
import { LambdaInvoker } from './invokers/LambdaInvoker';
import { EcsInvoker } from './invokers/EcsInvoker';
import { DockerInvoker } from './invokers/DockerInvoker';
import { JobDispatchStateDAO } from '../persistence/job/JobDispatchStateDAO';
import { KubernetesInvoker } from './invokers/KubernetesInvoker';
import { createKubernetesSecretClient, KubernetesRunSecret } from './invokers/KubernetesRunSecret';
import { createKubernetesJobClient } from './invokers/kubernetesJobClient';
import { JobBootstrapService } from '../services/job/JobBootstrapService';
import { CodexLoginService } from '../services/codexLogin/CodexLoginService';
import { CredentialRequirementsService } from '../services/CredentialRequirementsService';
import { createChildLogger } from '../config/logger';

const logger = createChildLogger({ component: 'WorkerInvokerFactory' });

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
    this.invokers.set('kubernetes', new KubernetesInvoker(
      createKubernetesJobClient,
      new JobBootstrapService(),
      new CredentialRequirementsService(),
      new JobDispatchStateDAO(),
      new CodexLoginService(),
      new KubernetesRunSecret(createKubernetesSecretClient),
    ));

    logger.info('Initialized invokers', {
      types: Array.from(this.invokers.keys()),
    });
  }

  registerInvoker(type: WorkerType, invoker: WorkerInvoker): void {
    this.invokers.set(type, invoker);
    logger.info('Registered invoker', { type });
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
    const strategyName = clanker.deploymentStrategy?.name?.toLowerCase();
    if (!strategyName) {
      throw new Error('Clanker has no deployment strategy');
    }
    if (strategyName === "aws-lambda-container") {
      return this.getInvoker("lambda");
    }
    return this.getInvoker(strategyName as WorkerType);
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
