import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { ProfileRole, ShortLinkPreference } from '@prisma/client';

export interface ProfilePersonaData {
  brandDescription?: string | null;
  toneOfVoice?: string | null;
  writingInstructions?: string | null;
  preferredCtas?: string[];
  contentRestrictions?: string | null;
  imageStyle?: string | null;
  targetAudience?: string | null;
  examplePosts?: string[];
}

@Injectable()
export class ProfileRepository {
  constructor(
    private _profile: PrismaRepository<'profile'>,
    private _profileMember: PrismaRepository<'profileMember'>,
    private _profilePersona: PrismaRepository<'profilePersona'>
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

  getZernioApiKey(profileId: string) {
    return this._profile.model.profile.findUnique({
      where: { id: profileId },
      select: { zernioApiKey: true },
    });
  }

  saveZernioApiKey(profileId: string, encryptedKey: string) {
    return this._profile.model.profile.update({
      where: { id: profileId },
      data: { zernioApiKey: encryptedKey },
    });
  }

  removeZernioApiKey(profileId: string) {
    return this._profile.model.profile.update({
      where: { id: profileId },
      data: { zernioApiKey: null },
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

  getPersona(profileId: string) {
    return this._profilePersona.model.profilePersona.findUnique({
      where: { profileId },
    });
  }

  upsertPersona(profileId: string, data: ProfilePersonaData) {
    const cleanArrays = {
      preferredCtas: (data.preferredCtas || [])
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean),
      examplePosts: (data.examplePosts || [])
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter(Boolean)
        .slice(0, 5),
    };
    const payload = {
      brandDescription: data.brandDescription ?? null,
      toneOfVoice: data.toneOfVoice ?? null,
      writingInstructions: data.writingInstructions ?? null,
      contentRestrictions: data.contentRestrictions ?? null,
      imageStyle: data.imageStyle ?? null,
      targetAudience: data.targetAudience ?? null,
      ...cleanArrays,
    };
    return this._profilePersona.model.profilePersona.upsert({
      where: { profileId },
      create: { profileId, ...payload },
      update: payload,
    });
  }

  deletePersona(profileId: string) {
    return this._profilePersona.model.profilePersona.deleteMany({
      where: { profileId },
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
