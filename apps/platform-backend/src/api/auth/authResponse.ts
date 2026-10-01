import type { UserRole } from "../../persistence/types/user";

type AuthUserPayload = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export function buildAuthResponse(user: AuthUserPayload) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    },
  };
}
