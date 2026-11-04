import { AppAccessDAO } from "../../persistence/apps/AppAccessDAO";
import { AppDAO } from "../../persistence/apps/AppDAO";
import { AppSignInDAO } from "../../persistence/apps/AppSignInDAO";
import { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import { AppAccess } from "./AppAccess";
import { AppGatewayResolver } from "./AppGatewayResolver";
import { AppOrigins } from "./AppOrigins";
import { AppSignInService } from "./AppSignInService";
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
  const spaces = new AppSpaceDAO();
  const apps = new AppDAO();
  const signIns = new AppSignInDAO();
  const access = new AppAccess(new SpaceMemberDAO(), new AppAccessDAO());
  const origins = new AppOrigins();
  signIn = {
    origins,
    service: new AppSignInService(spaces, apps, access, signIns, origins),
    resolver: new AppGatewayResolver(spaces, apps, signIns, access, appHosting().host),
  };
  return signIn;
}
