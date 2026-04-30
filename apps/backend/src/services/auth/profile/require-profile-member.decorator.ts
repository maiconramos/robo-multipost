import { SetMetadata } from '@nestjs/common';
import { ProfileRole } from '@prisma/client';

export const REQUIRE_PROFILE_MEMBER_KEY = 'requireProfileMember';

export interface RequireProfileMemberMetadata {
  role: ProfileRole;
  bodyField?: string;
}

type ProfileMemberDecorator = MethodDecorator & ClassDecorator;

interface RequireProfileMemberDecorator {
  (role: ProfileRole): ProfileMemberDecorator;
  fromBody: (bodyField: string, role: ProfileRole) => ProfileMemberDecorator;
}

const baseDecorator = (role: ProfileRole): ProfileMemberDecorator =>
  SetMetadata(REQUIRE_PROFILE_MEMBER_KEY, { role } as RequireProfileMemberMetadata);

const fromBody = (
  bodyField: string,
  role: ProfileRole
): ProfileMemberDecorator =>
  SetMetadata(REQUIRE_PROFILE_MEMBER_KEY, {
    role,
    bodyField,
  } as RequireProfileMemberMetadata);

export const RequireProfileMember: RequireProfileMemberDecorator =
  Object.assign(baseDecorator, { fromBody });
