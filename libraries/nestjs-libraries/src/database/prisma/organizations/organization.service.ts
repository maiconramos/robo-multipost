import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { HttpException, Injectable } from '@nestjs/common';
import { OrganizationRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.repository';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { AddTeamMemberDto } from '@gitroom/nestjs-libraries/dtos/settings/add.team.member.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { Organization, ShortLinkPreference } from '@prisma/client';
import Late from '@getlatedev/node';
import { AutopostService } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.service';

@Injectable()
export class OrganizationService {
  constructor(
    private _organizationRepository: OrganizationRepository,
    private _notificationsService: NotificationService
  ) {}
  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & { providerId?: string },
    ip: string,
    userAgent: string
  ) {
    return this._organizationRepository.createOrgAndUser(
      body,
      this._notificationsService.hasEmailProvider(),
      ip,
      userAgent
    );
  }

  async getCount() {
    return this._organizationRepository.getCount();
  }

  async createMaxUser(id: string, name: string, saasName: string, email: string) {
    return this._organizationRepository.createMaxUser(id, name, saasName, email);
  }

  addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: 'USER' | 'ADMIN'
  ) {
    return this._organizationRepository.addUserToOrg(userId, id, orgId, role);
  }

  getOrgById(id: string) {
    return this._organizationRepository.getOrgById(id);
  }

  getOrgByApiKey(api: string) {
    return this._organizationRepository.getOrgByApiKey(api);
  }

  getUserOrg(id: string) {
    return this._organizationRepository.getUserOrg(id);
  }

  getOrgsByUserId(userId: string) {
    return this._organizationRepository.getOrgsByUserId(userId);
  }

  updateApiKey(orgId: string) {
    return this._organizationRepository.updateApiKey(orgId);
  }

  getTeam(orgId: string) {
    return this._organizationRepository.getTeam(orgId);
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    return this._organizationRepository.setStreak(organizationId, type);
  }

  getOrgByCustomerId(customerId: string) {
    return this._organizationRepository.getOrgByCustomerId(customerId);
  }

  async inviteTeamMember(orgId: string, body: AddTeamMemberDto) {
    const timeLimit = dayjs().add(1, 'hour').format('YYYY-MM-DD HH:mm:ss');
    const id = makeId(5);
    const url =
      process.env.FRONTEND_URL +
      `/?org=${AuthService.signJWT({ ...body, orgId, timeLimit, id })}`;
    if (body.sendEmail) {
      await this._notificationsService.sendEmail(
        body.email,
        'You have been invited to join an organization',
        `You have been invited to join an organization. Click <a href="${url}">here</a> to join.<br />The link will expire in 1 hour.`
      );
    }
    return { url };
  }

  async deleteTeamMember(org: Organization, userId: string) {
    const userOrgs = await this._organizationRepository.getOrgsByUserId(userId);
    const findOrgToDelete = userOrgs.find((orgUser) => orgUser.id === org.id);
    if (!findOrgToDelete) {
      throw new Error('User is not part of this organization');
    }

    // @ts-ignore
    const myRole = org.users[0].role;
    const userRole = findOrgToDelete.users[0].role;
    const myLevel = myRole === 'USER' ? 0 : myRole === 'ADMIN' ? 1 : 2;
    const userLevel = userRole === 'USER' ? 0 : userRole === 'ADMIN' ? 1 : 2;

    if (myLevel < userLevel) {
      throw new Error('You do not have permission to delete this user');
    }

    return this._organizationRepository.deleteTeamMember(org.id, userId);
  }

  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._organizationRepository.disableOrEnableNonSuperAdminUsers(
      orgId,
      disable
    );
  }

  getShortlinkPreference(orgId: string) {
    return this._organizationRepository.getShortlinkPreference(orgId);
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organizationRepository.updateShortlinkPreference(
      orgId,
      shortlink
    );
  }

  private async fetchLateUsage(apiKey: string) {
    const late = new Late({ apiKey });
    const result = await late.usage.getUsageStats();
    // SDK returns { data: UsageStats } via RequestResult wrapper
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

  async getLateSettings(orgId: string) {
    const org = await this._organizationRepository.getLateApiKey(orgId);
    if (!org?.lateApiKey) {
      return { configured: false, usage: null };
    }

    try {
      const apiKey = AuthService.fixedDecryption(org.lateApiKey);
      const usage = await this.fetchLateUsage(apiKey);
      return { configured: true, usage };
    } catch {
      return { configured: true, usage: null };
    }
  }

  async saveLateApiKey(orgId: string, apiKey: string) {
    if (!apiKey.startsWith('sk_')) {
      throw new HttpException('Invalid Late API key format. Key must start with "sk_".', 400);
    }

    // Validate key by calling Late API
    try {
      const usage = await this.fetchLateUsage(apiKey);
      const encrypted = AuthService.fixedEncryption(apiKey);
      await this._organizationRepository.saveLateApiKey(orgId, encrypted);
      return { configured: true, usage };
    } catch {
      throw new HttpException('Invalid Late API key. Could not connect to Late.', 400);
    }
  }

  async removeLateApiKey(orgId: string) {
    await this._organizationRepository.removeLateApiKey(orgId);
    return { configured: false };
  }

  async getDecryptedLateApiKey(orgId: string): Promise<string | null> {
    const org = await this._organizationRepository.getLateApiKey(orgId);
    if (!org?.lateApiKey) {
      return null;
    }
    return AuthService.fixedDecryption(org.lateApiKey);
  }

  async getShareLateWithProfiles(orgId: string) {
    return this._organizationRepository.getShareLateWithProfiles(orgId);
  }

  async updateShareLateWithProfiles(orgId: string, enabled: boolean) {
    return this._organizationRepository.updateShareLateWithProfiles(orgId, enabled);
  }
}
