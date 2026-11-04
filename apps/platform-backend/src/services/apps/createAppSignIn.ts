import { AppAccessDAO } from "../../persistence/apps/AppAccessDAO";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import { AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import { AppAccess } from "./AppAccess";
import { AppGatewayResolver } from "./AppGatewayResolver";
import { AppOrigins } from "./AppOrigins";
import { AppSignInService } from "./AppSignInService";
import { AppTargets } from "./AppTargets";
import { appHosting } from "./createAppHosting";

export interface AppSignIn {
  origins: AppOrigins;
  service: AppSignInService;
  resolver: AppGatewayResolver;
}

let signIn: AppSignIn | null = null;

/** One per process, shared by the handoff route and the gateway. */
export function appSignIn(): AppSignIn {
  if (signIn) return signIn;
  const signIns = new AppSignInDAO();
  const access = new AppAccess(new SpaceMemberDAO(), new AppAccessDAO());
  const targets = new AppTargets(new AppSpaceDAO(), new AppPreviewDAO(), new AppDAO(), access);
  const origins = new AppOrigins();
  signIn = {
    origins,
    service: new AppSignInService(targets, signIns, origins),
    resolver: new AppGatewayResolver(targets, signIns, appHosting().host),
  };
  return signIn;
}
