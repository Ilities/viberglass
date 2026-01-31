import type { PublicUser } from "../../persistence/user/UserDAO";
import type { UserSessionRecord } from "../../persistence/user/UserSessionDAO";
import type { UserRole } from "../../persistence/types/user";

export type AuthPermission = string;

export interface AuthContext {
  user: PublicUser;
  session: UserSessionRecord;
  roles: UserRole[];
  permissions: AuthPermission[];
}
