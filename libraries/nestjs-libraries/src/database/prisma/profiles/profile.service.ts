import { HttpException, Injectable } from '@nestjs/common';
import {
  ProfileRepository,
  ProfilePersonaData,
} from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.repository';
import { ProfileRole, Role, ShortLinkPreference } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import Zernio from '@zernio/node';

@Injectable()
export class ProfileService {
  constructor(private _profileRepository: ProfileRepository) {}

  getProfilesByOrgId(orgId: string) {
    return this._profileRepository.getProfilesByOrgId(orgId);
  }

  getProfileById(orgId: string, profileId: string) {
    return this._profileRepository.getProfileById(orgId, profileId);
  }

  getDefaultProfile(orgId: string) {
    return this._profileRepository.getDefaultProfile(orgId);
  }

  async createProfile(
    orgId: string,
    data: { name: string; description?: string; avatarUrl?: string },
    creatorUserId?: string
  ) {
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const profile = await this._profileRepository.createProfile(orgId, { ...data, slug });
    if (creatorUserId) {
      await this._profileRepository.addMember(profile.id, creatorUserId, 'OWNER');
    }
    return profile;
  }

  updateProfile(
    orgId: string,
    profileId: string,
    data: { name?: string; description?: string; avatarUrl?: string }
  ) {
    const updateData: any = { ...data };
    if (data.name) {
      updateData.slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    return this._profileRepository.updateProfile(orgId, profileId, updateData);
  }

  async deleteProfile(orgId: string, profileId: string) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    if (profile.isDefault) {
      throw new HttpException('Cannot delete the default profile', 400);
    }
    return this._profileRepository.deleteProfile(orgId, profileId);
  }

  private static readonly ROLE_RANK: Record<ProfileRole, number> = {
    OWNER: 4,
    MANAGER: 3,
    EDITOR: 2,
    VIEWER: 1,
  };

  private static rankOf(role?: ProfileRole | null): number {
    return role ? ProfileService.ROLE_RANK[role] ?? 0 : 0;
  }

  // Ator org USER (OWNER/MANAGER do perfil via guard) nao pode conceder nem
  // remover papel acima do proprio — impede escalonamento MANAGER -> OWNER.
  // Recebe todos os ranks relevantes ja resolvidos.
  private assertRankAllowed(
    actorRank: number,
    ...targetRanks: number[]
  ) {
    if (targetRanks.some((rank) => rank > actorRank)) {
      throw new HttpException(
        {
          message: 'Cannot act on a role above your own',
          code: 'PROFILE_ROLE_ESCALATION',
        },
        403
      );
    }
  }

  async addMember(
    orgId: string,
    profileId: string,
    userId: string,
    role: ProfileRole,
    actor?: { userId: string; orgRole: Role }
  ) {
    // Fail-closed contra role fora do enum (mesmo que o DTO seja contornado):
    // um valor desconhecido nao pode escapar da checagem de hierarquia abaixo.
    if (!(role in ProfileService.ROLE_RANK)) {
      throw new HttpException('Invalid profile role', 400);
    }
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    const belongsToOrg = await this._profileRepository.isUserInOrg(
      userId,
      orgId
    );
    if (!belongsToOrg) {
      throw new HttpException('User does not belong to this workspace', 400);
    }
    if (actor && actor.orgRole === 'USER') {
      const [actorMember, existingMember] = await Promise.all([
        this._profileRepository.getMemberRole(profileId, actor.userId),
        this._profileRepository.getMemberRole(profileId, userId),
      ]);
      // Bloqueia tanto conceder papel acima do proprio quanto rebaixar/mexer
      // num membro que ja tem papel acima do proprio (ex.: MANAGER upsertando
      // um OWNER existente com role menor).
      this.assertRankAllowed(
        ProfileService.rankOf(actorMember?.role),
        ProfileService.rankOf(role),
        ProfileService.rankOf(existingMember?.role)
      );
    }
    return this._profileRepository.addMember(profileId, userId, role);
  }

  async removeMember(
    orgId: string,
    profileId: string,
    userId: string,
    actor?: { userId: string; orgRole: Role }
  ) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    if (actor && actor.orgRole === 'USER') {
      const [actorMember, targetMember] = await Promise.all([
        this._profileRepository.getMemberRole(profileId, actor.userId),
        this._profileRepository.getMemberRole(profileId, userId),
      ]);
      if (targetMember) {
        this.assertRankAllowed(
          ProfileService.rankOf(actorMember?.role),
          ProfileService.rankOf(targetMember.role)
        );
      }
    }
    return this._profileRepository.removeMember(profileId, userId);
  }

  getMemberRole(profileId: string, userId: string) {
    return this._profileRepository.getMemberRole(profileId, userId);
  }

  async getUserProfileIds(userId: string, orgId: string) {
    const members = await this._profileRepository.getUserProfileIds(userId, orgId);
    return members.map((m) => m.profileId);
  }

  getUserProfileMemberships(userId: string, orgId: string) {
    return this._profileRepository.getUserProfileIds(userId, orgId);
  }

  async getAccessibleProfiles(orgId: string, userId: string, orgRole: Role) {
    const profiles = await this._profileRepository.getProfilesByOrgId(orgId);
    if (orgRole === 'ADMIN' || orgRole === 'SUPERADMIN') {
      return profiles;
    }
    const memberships = await this._profileRepository.getUserProfileIds(
      userId,
      orgId
    );
    const accessibleIds = new Set(memberships.map((m) => m.profileId));
    return profiles.filter((p) => accessibleIds.has(p.id));
  }

  async getEffectiveProfileRole(
    orgId: string,
    profileId: string,
    userId: string,
    orgRole: Role
  ): Promise<ProfileRole | null> {
    const profile = await this._profileRepository.getProfileById(
      orgId,
      profileId
    );
    if (!profile) {
      return null;
    }
    if (orgRole === 'ADMIN' || orgRole === 'SUPERADMIN') {
      return 'OWNER';
    }
    const member = await this._profileRepository.getMemberRole(
      profileId,
      userId
    );
    return member?.role ?? null;
  }

  async assertProfileAccess(
    orgId: string,
    profileId: string,
    userId: string,
    orgRole: Role
  ) {
    const profile = await this._profileRepository.getProfileById(
      orgId,
      profileId
    );
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    if (orgRole === 'ADMIN' || orgRole === 'SUPERADMIN') {
      return { profile, role: 'OWNER' as ProfileRole };
    }
    const member = await this._profileRepository.getMemberRole(
      profileId,
      userId
    );
    if (!member) {
      throw new HttpException(
        { message: 'Profile access denied', code: 'PROFILE_ACCESS_DENIED' },
        403
      );
    }
    return { profile, role: member.role };
  }

  async getMembers(orgId: string, profileId: string) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    return this._profileRepository.getMembers(profileId);
  }

  private async fetchZernioUsage(apiKey: string) {
    const zernio = new Zernio({ apiKey });
    const result = await zernio.usage.getUsageStats();
    const stats = (result as any)?.data ?? result;
    return {
      planName: stats?.planName ?? null,
      uploads: {
        used: stats?.usage?.uploads ?? 0,
        limit: stats?.limits?.uploads ?? 0,
      },
      profiles: {
        used: stats?.usage?.profiles ?? 0,
        limit: stats?.limits?.profiles ?? 0,
      },
      lastReset: stats?.usage?.lastReset ?? null,
    };
  }

  async getZernioSettings(profileId: string) {
    const profile = await this._profileRepository.getZernioApiKey(profileId);
    if (!profile?.zernioApiKey) {
      return { configured: false, usage: null };
    }

    try {
      const apiKey = AuthService.fixedDecryption(profile.zernioApiKey);
      const usage = await this.fetchZernioUsage(apiKey);
      return { configured: true, usage };
    } catch {
      return { configured: true, usage: null };
    }
  }

  async saveZernioApiKey(profileId: string, apiKey: string) {
    if (!apiKey.startsWith('sk_')) {
      throw new HttpException('Invalid Zernio API key format. Key must start with "sk_".', 400);
    }

    try {
      const usage = await this.fetchZernioUsage(apiKey);
      const encrypted = AuthService.fixedEncryption(apiKey);
      await this._profileRepository.saveZernioApiKey(profileId, encrypted);
      return { configured: true, usage };
    } catch {
      throw new HttpException('Invalid Zernio API key. Could not connect to Zernio.', 400);
    }
  }

  async removeZernioApiKey(profileId: string) {
    await this._profileRepository.removeZernioApiKey(profileId);
    return { configured: false };
  }

  async getDecryptedZernioApiKey(profileId: string): Promise<string | null> {
    const profile = await this._profileRepository.getZernioApiKey(profileId);
    if (!profile?.zernioApiKey) {
      return null;
    }
    return AuthService.fixedDecryption(profile.zernioApiKey);
  }

  getShortlinkPreference(profileId: string) {
    return this._profileRepository.getShortlinkPreference(profileId);
  }

  updateShortlinkPreference(profileId: string, shortlink: ShortLinkPreference) {
    return this._profileRepository.updateShortlinkPreference(profileId, shortlink);
  }

  getAiCredits(orgId: string, profileId: string) {
    return this._profileRepository.getAiCredits(orgId, profileId);
  }

  async updateAiCredits(
    orgId: string,
    profileId: string,
    data: { aiImageCredits?: number | null; aiVideoCredits?: number | null }
  ) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    if (profile.isDefault) {
      throw new HttpException('Cannot set credit limits on the default profile', 400);
    }
    return this._profileRepository.updateAiCredits(orgId, profileId, data);
  }

  getAllProfilesWithCredits(orgId: string) {
    return this._profileRepository.getAllProfilesWithCredits(orgId);
  }

  async getPersona(orgId: string, profileId: string) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    return this._profileRepository.getPersona(profileId);
  }

  getPersonaForAgent(profileId: string) {
    return this._profileRepository.getPersona(profileId);
  }

  async upsertPersona(orgId: string, profileId: string, data: ProfilePersonaData) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    return this._profileRepository.upsertPersona(profileId, data);
  }

  async deletePersona(orgId: string, profileId: string) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    return this._profileRepository.deletePersona(profileId);
  }

  getProfileByApiKey(apiKey: string) {
    return this._profileRepository.getProfileByApiKey(apiKey);
  }

  async updateApiKey(orgId: string, profileId: string) {
    const profile = await this._profileRepository.getProfileById(orgId, profileId);
    if (!profile) {
      throw new HttpException('Profile not found', 404);
    }
    return this._profileRepository.updateApiKey(orgId, profileId);
  }
}
