import type { Role, UserStatus } from "@prisma/client";

export interface Actor {
  id: string;
  email: string;
  displayName: string;
  primaryRole: Role;
  roles: Role[];
  status: UserStatus;
  emailVerified: boolean;
}
