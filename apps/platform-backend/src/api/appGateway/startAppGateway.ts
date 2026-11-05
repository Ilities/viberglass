import { createChildLogger } from "../../config/logger";
import { appsDomain } from "../../services/apps/appSpaceAvailability";
import { appSignIn } from "../../services/apps/createAppSignIn";
import { PreviewOpenings } from "../../services/apps/PreviewOpenings";
import { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
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
  const { origins, service, resolver, targets } = appSignIn();
  const domain = origins.domain ?? "";
  if (!origins.secure && domain !== "localhost" && !domain.endsWith(".localhost")) {
    logger.warn("Apps are served over http on a name other than localhost: one app can sign people in to another as someone else. Set APPS_PUBLIC_URL to an https address.", { domain });
  }
  const openings = new PreviewOpenings(new AppPreviewDAO());
  const certificateAllowed = async (host: string) => {
    const label = origins.slugFromHost(host);
    return Boolean(label && (await targets.find(label)));
  };
  createAppGateway({
    origins,
    resolver,
    signIn: service,
    frontendUrl,
    previewOpened: (id) => openings.opened(id),
    trustProxy: env.APPS_TRUST_PROXY?.trim() === "true",
    certificateAllowed,
  }).listen(port, () => logger.info("App gateway listening", { port }));
}
