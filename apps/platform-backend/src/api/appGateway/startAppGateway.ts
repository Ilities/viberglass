import { createChildLogger } from "../../config/logger";
import { appsDomain } from "../../services/apps/appSpaceAvailability";
import { appSignIn } from "../../services/apps/createAppSignIn";
import { createAppGateway } from "./createAppGateway";

const logger = createChildLogger({ server: "app-gateway" });

/** Apps get their own listener, on APPS_PORT, when an apps domain is set. */
export function startAppGateway(env: Record<string, string | undefined> = process.env): void {
  const port = Number(env.APPS_PORT);
  const frontendUrl = env.PLATFORM_FRONTEND_URL?.trim();
  if (!port || !appsDomain(env)) return;
  if (!frontendUrl) {
    logger.warn("Not serving apps: PLATFORM_FRONTEND_URL is needed to sign people in to them");
    return;
  }
  const { origins, service, resolver } = appSignIn();
  createAppGateway({ origins, resolver, signIn: service, frontendUrl }).listen(port, () => logger.info("App gateway listening", { port }));
}
