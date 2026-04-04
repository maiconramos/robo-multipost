import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ProfileRole, ShortLinkPreference } from '@prisma/client';

@Injectable()
export class ProfileRepository {
  constructor(
    private _profile: PrismaRepository<'profile'>,
    private _profileMember: PrismaRepository<'profileMember'>
  ) {}

  getProfilesByOrgId(orgId: string) {
    return this._profile.model.profile.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: {
        members: {
          select: {
            userId: true,
            role: true,
          },
        },
        _count: {
          select: {
            integrations: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  getProfileById(orgId: string, profileId: string) {
    return this._profile.model.profile.findFirst({
      where: { id: profileId, organizationId: orgId, deletedAt: null },
      include: {
        members: {
          select: {
            id: true,
            userId: true,
            role: true,
          },
        },
      },
    });
  }

  getDefaultProfile(orgId: string) {
    return this._profile.model.profile.findFirst({
      where: { organizationId: orgId, isDefault: true, deletedAt: null },
    });
  }

  createProfile(
    orgId: string,
    data: { name: string; slug: string; description?: string; avatarUrl?: string }
  ) {
    return this._profile.model.profile.create({
      data: {
        organizationId: orgId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  updateProfile(
    orgId: string,
    profileId: string,
    data: { name?: string; slug?: string; description?: string; avatarUrl?: string }
  ) {
    return this._profile.model.profile.update({
      where: { id: profileId, organizationId: orgId },
      data,
    });
  }

  deleteProfile(orgId: string, profileId: string) {
    return this._profile.model.profile.update({
      where: { id: profileId, organizationId: orgId },
      data: { deletedAt: new Date() },
    });
  }

  addMember(profileId: string, userId: string, role: ProfileRole) {
    return this._profileMember.model.profileMember.upsert({
      where: {
        profileId_userId: { profileId, userId },
      },
      create: { profileId, userId, role },
      update: { role },
    });
  }

  removeMember(profileId: string, userId: string) {
    return this._profileMember.model.profileMember.delete({
      where: {
        profileId_userId: { profileId, userId },
      },
    });
  }

  getMemberRole(profileId: string, userId: string) {
    return this._profileMember.model.profileMember.findUnique({
      where: {
        profileId_userId: { profileId, userId },
      },
      select: { role: true },
    });
  }

  getUserProfileIds(userId: string, orgId: string) {
    return this._profileMember.model.profileMember.findMany({
      where: {
        userId,
        profile: {
          organizationId: orgId,
          deletedAt: null,
        },
      },
      select: { profileId: true },
    });
  }

  getMembers(profileId: string) {
    return this._profileMember.model.profileMember.findMany({
      where: { profileId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  getLateApiKey(profileId: string) {
    return this._profile.model.profile.findUnique({
      where: { id: profileId },
      select: { lateApiKey: true },
    });
  }

  saveLateApiKey(profileId: string, encryptedKey: string) {
    return this._profile.model.profile.update({
      where: { id: profileId },
      data: { lateApiKey: encryptedKey },
    });
  }

  removeLateApiKey(profileId: string) {
    return this._profile.model.profile.update({
      where: { id: profileId },
      data: { lateApiKey: null },
    });
  }

  getShortlinkPreference(profileId: string) {
    return this._profile.model.profile.findUnique({
      where: { id: profileId },
      select: { shortlink: true },
    });
  }

  updateShortlinkPreference(profileId: string, shortlink: ShortLinkPreference) {
    return this._profile.model.profile.update({
      where: { id: profileId },
      data: { shortlink },
    });
  }

  getAiCredits(orgId: string, profileId: string) {
    return this._profile.model.profile.findFirst({
      where: { id: profileId, organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        isDefault: true,
        aiImageCredits: true,
        aiVideoCredits: true,
      },
    });
  }

  updateAiCredits(
    orgId: string,
    profileId: string,
    data: { aiImageCredits?: number | null; aiVideoCredits?: number | null }
  ) {
    return this._profile.model.profile.update({
      where: { id: profileId, organizationId: orgId },
      data,
    });
  }

  getAllProfilesWithCredits(orgId: string) {
    return this._profile.model.profile.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        isDefault: true,
        aiImageCredits: true,
        aiVideoCredits: true,
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }
}
