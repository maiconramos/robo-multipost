import { HttpException, Injectable } from '@nestjs/common';
import { ProfileRepository } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.repository';
import { ProfileRole, ShortLinkPreference } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import Late from '@getlatedev/node';

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

  addMember(profileId: string, userId: string, role: ProfileRole) {
    return this._profileRepository.addMember(profileId, userId, role);
  }

  removeMember(profileId: string, userId: string) {
    return this._profileRepository.removeMember(profileId, userId);
  }

  getMemberRole(profileId: string, userId: string) {
    return this._profileRepository.getMemberRole(profileId, userId);
  }

  async getUserProfileIds(userId: string, orgId: string) {
    const members = await this._profileRepository.getUserProfileIds(userId, orgId);
    return members.map((m) => m.profileId);
  }

  getMembers(profileId: string) {
    return this._profileRepository.getMembers(profileId);
  }

  private async fetchLateUsage(apiKey: string) {
    const late = new Late({ apiKey });
    const result = await late.usage.getUsageStats();
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

  async getLateSettings(profileId: string) {
    const profile = await this._profileRepository.getLateApiKey(profileId);
    if (!profile?.lateApiKey) {
      return { configured: false, usage: null };
    }

    try {
      const apiKey = AuthService.fixedDecryption(profile.lateApiKey);
      const usage = await this.fetchLateUsage(apiKey);
      return { configured: true, usage };
    } catch {
      return { configured: true, usage: null };
    }
  }

  async saveLateApiKey(profileId: string, apiKey: string) {
    if (!apiKey.startsWith('sk_')) {
      throw new HttpException('Invalid Late API key format. Key must start with "sk_".', 400);
    }

    try {
      const usage = await this.fetchLateUsage(apiKey);
      const encrypted = AuthService.fixedEncryption(apiKey);
      await this._profileRepository.saveLateApiKey(profileId, encrypted);
      return { configured: true, usage };
    } catch {
      throw new HttpException('Invalid Late API key. Could not connect to Late.', 400);
    }
  }

  async removeLateApiKey(profileId: string) {
    await this._profileRepository.removeLateApiKey(profileId);
    return { configured: false };
  }

  async getDecryptedLateApiKey(profileId: string): Promise<string | null> {
    const profile = await this._profileRepository.getLateApiKey(profileId);
    if (!profile?.lateApiKey) {
      return null;
    }
    return AuthService.fixedDecryption(profile.lateApiKey);
  }

  getShortlinkPreference(profileId: string) {
    return this._profileRepository.getShortlinkPreference(profileId);
  }

  updateShortlinkPreference(profileId: string, shortlink: ShortLinkPreference) {
    return this._profileRepository.updateShortlinkPreference(profileId, shortlink);
  }
}
