import { HttpException, Injectable } from '@nestjs/common';
import { ProfileRepository } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.repository';
import { ProfileRole } from '@prisma/client';

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

  createProfile(
    orgId: string,
    data: { name: string; description?: string; avatarUrl?: string }
  ) {
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return this._profileRepository.createProfile(orgId, { ...data, slug });
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
}
