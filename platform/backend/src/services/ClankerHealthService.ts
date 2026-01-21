import type { Clanker } from '@viberator/types';
import type { ClankerHealthStatus } from '@viberator/types';
import { getWorkerInvokerFactory } from '../workers/WorkerInvokerFactory';

export class ClankerHealthService {
  constructor() {}

  async checkClankerHealth(clanker: Clanker): Promise<ClankerHealthStatus> {
    const checks = {
      resourceExists: true,  // We found it in DB
      deploymentConfigured: false,
      invokerAvailable: false,
    };

    // Check deployment configuration
    if (!clanker.deploymentStrategy || !clanker.deploymentConfig) {
      return {
        clankerId: clanker.id,
        isHealthy: false,
        status: 'unhealthy',
        checks,
        message: 'Deployment strategy or configuration not set',
        lastChecked: new Date().toISOString(),
      };
    }
    checks.deploymentConfigured = true;

    // Check invoker availability
    const factory = getWorkerInvokerFactory();
    try {
      const invoker = factory.getInvokerForClanker(clanker);
      checks.invokerAvailable = await invoker.isAvailable();
    } catch (error) {
      console.warn(`[ClankerHealthService] Failed to get invoker for clanker ${clanker.id}:`, error);
      checks.invokerAvailable = false;
    }

    const isHealthy = checks.invokerAvailable;

    return {
      clankerId: clanker.id,
      isHealthy,
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      message: isHealthy ? 'Clanker is ready' : 'Invoker unavailable',
      lastChecked: new Date().toISOString(),
    };
  }
}
