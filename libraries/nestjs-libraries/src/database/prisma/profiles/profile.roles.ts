import { ProfileRole } from '@prisma/client';

export const PROFILE_ROLE_RANK: Record<ProfileRole, number> = {
  OWNER: 4,
  MANAGER: 3,
  EDITOR: 2,
  VIEWER: 1,
};

export const hasMinProfileRole = (
  actual: ProfileRole | null | undefined,
  required: ProfileRole
): boolean => {
  if (!actual) return false;
  return PROFILE_ROLE_RANK[actual] >= PROFILE_ROLE_RANK[required];
};
