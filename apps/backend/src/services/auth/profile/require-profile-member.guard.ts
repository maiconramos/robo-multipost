import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Organization, User } from '@prisma/client';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { hasMinProfileRole } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.roles';
import {
  REQUIRE_PROFILE_MEMBER_KEY,
  RequireProfileMemberMetadata,
} from './require-profile-member.decorator';

const isEnforcementEnabled = () => {
  const flag = process.env.PROFILE_MEMBERSHIP_ENFORCED;
  return flag === 'true' || flag === '1';
};

const isOrgAdmin = (
  user: User,
  org: Organization & { users: { role: string }[] }
): boolean => {
  if (user?.isSuperAdmin) return true;
  const role = org?.users?.[0]?.role;
  return role === 'ADMIN' || role === 'SUPERADMIN';
};

@Injectable()
export class RequireProfileMembershipGuard implements CanActivate {
  constructor(
    private _reflector: Reflector,
    private _profileService: ProfileService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this._reflector.get<RequireProfileMemberMetadata>(
      REQUIRE_PROFILE_MEMBER_KEY,
      context.getHandler()
    );

    if (!metadata) {
      return true;
    }

    if (!isEnforcementEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Request & {
        user: User;
        org: Organization & { users: { role: string }[] };
        profile?: { id: string } | null;
      }
    >();

    const { user, org } = request;

    if (isOrgAdmin(user, org)) {
      return true;
    }

    const profileId =
      (request.params as Record<string, string | undefined>)?.id ??
      (request.params as Record<string, string | undefined>)?.profileId ??
      (metadata.bodyField
        ? (request.body as Record<string, unknown>)?.[metadata.bodyField]
        : undefined) ??
      request.profile?.id;

    if (!profileId || typeof profileId !== 'string') {
      throw new HttpException('Profile context required', 403);
    }

    const membership = await this._profileService.getMemberRole(profileId, user.id);
    const actualRole = membership?.role ?? null;

    if (!hasMinProfileRole(actualRole, metadata.role)) {
      throw new HttpException('Insufficient profile role', 403);
    }

    return true;
  }
}
