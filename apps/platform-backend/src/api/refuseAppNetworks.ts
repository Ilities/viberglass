import type { Server } from "net";
import { defaultDeploymentStrategyName } from "../provisioning/shared/deploymentStrategies";
import { AppSubnetPool } from "../services/apps/AppSubnetPool";
import { DEFAULT_APP_NETWORK_POOL } from "../services/apps/appHostingConfig";

type Env = Record<string, string | undefined>;

/**
 * On Docker the backend joins every app's network so the gateway can reach the
 * app, and Docker doesn't filter traffic within a network. Connections apps
 * open to the backend are dropped here, on every port it listens on.
 */
export function refuseAppNetworks<T extends Server>(server: T, env: Env = process.env): T {
  if (defaultDeploymentStrategyName(env) !== "docker") return server;
  const pool = new AppSubnetPool(env.APPS_NETWORK_POOL?.trim() || DEFAULT_APP_NETWORK_POOL);
  server.prependListener("connection", (socket) => {
    if (pool.containsAddress(socket.remoteAddress)) socket.destroy();
  });
  return server;
}
