import { HttpException, Injectable } from '@nestjs/common';
import {
  ProfileRepository,
  ProfilePersonaData,
} from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.repository';
import { ProfileRole, ShortLinkPreference } from '@prisma/client';
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
}
