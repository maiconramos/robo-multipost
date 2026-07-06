import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Role, ShortLinkPreference, SubscriptionTier } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';

@Injectable()
export class OrganizationRepository {
  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _userOrg: PrismaRepository<'userOrganization'>,
    private _user: PrismaRepository<'user'>,
    private _profileMember: PrismaRepository<'profileMember'>
  ) {}

  createMaxUser(id: string, name: string, saasName: string, email: string) {
    return this._organization.model.organization.create({
      select: {
        id: true,
        apiKey: true,
      },
      data: {
        name: name ? `${name}###${id}` : `Unnamed User###${id}`,
        apiKey: AuthService.fixedEncryption(makeSecureId(20)),
        isTrailing: false,
        profilesBootstrappedAt: new Date(),
        profiles: {
          create: {
            name: 'Default',
            slug: 'default',
            isDefault: true,
          },
        },
        subscription: {
          create: {
            totalChannels: 1000000,
            subscriptionTier: 'ULTIMATE',
            isLifetime: true,
            period: 'YEARLY',
          },
        },
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                activated: true,
                email: email
                  ? email.split('@').join(`+${saasName}@`)
                  : `${saasName}+` + makeId(10) + '@postiz.com',
                name: name ? `${name}###${id}` : `Unnamed User###${id}`,
                providerName: 'LOCAL',
                password: AuthService.hashPassword(makeId(500)),
                timezone: 0,
              },
            },
          },
        },
      },
    });
  }

  getOrgByApiKey(api: string) {
    return this._organization.model.organization.findFirst({
      where: {
        apiKey: api,
      },
      include: {
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
          },
        },
      },
    });
  }

  getCount() {
    return this._organization.model.organization.count();
  }

  getUserOrg(id: string) {
    return this._userOrg.model.userOrganization.findFirst({
      where: {
        id,
      },
      select: {
        user: true,
        organization: {
          include: {
            users: {
              select: {
                id: true,
                disabled: true,
                role: true,
                userId: true,
              },
            },
            subscription: {
              select: {
                subscriptionTier: true,
                totalChannels: true,
                isLifetime: true,
              },
            },
          },
        },
      },
    });
  }

  getImpersonateUser(name: string) {
    return this._userOrg.model.userOrganization.findMany({
      where: {
        OR: [
          {
            organizationId: {
              contains: name,
            },
          },
          {
            user: {
              OR: [
                {
                  name: {
                    contains: name,
                  },
                },
                {
                  email: {
                    contains: name,
                  },
                },
                {
                  id: {
                    contains: name,
                  },
                },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        organization: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  updateApiKey(orgId: string) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        apiKey: AuthService.fixedEncryption(makeSecureId(20)),
      },
    });
  }

  async getOrgsByUserId(userId: string) {
    return this._organization.model.organization.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      include: {
        users: {
          where: {
            userId,
          },
          select: {
            disabled: true,
            role: true,
          },
        },
        subscription: {
          select: {
            subscriptionTier: true,
            totalChannels: true,
            isLifetime: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async getOrgById(id: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id,
      },
    });
  }

  async isInviteConsumed(inviteId: string) {
    const existing = await this._user.model.user.findFirst({
      where: { inviteId },
      select: { id: true },
    });
    return !!existing;
  }

  async addUserToOrg(
    userId: string,
    id: string,
    orgId: string,
    role: 'USER' | 'ADMIN'
  ) {
    const checkIfInviteExists = await this._user.model.user.findFirst({
      where: {
        inviteId: id,
      },
    });

    if (checkIfInviteExists) {
      return false;
    }

    const checkForSubscription =
      await this._organization.model.organization.findFirst({
        where: {
          id: orgId,
        },
        select: {
          subscription: true,
        },
      });

    if (
      process.env.STRIPE_PUBLISHABLE_KEY &&
      checkForSubscription?.subscription?.subscriptionTier ===
        SubscriptionTier.STANDARD
    ) {
      return false;
    }

    const create = await this._userOrg.model.userOrganization.create({
      data: {
        role,
        userId,
        organizationId: orgId,
      },
    });

    await this._user.model.user.update({
      where: {
        id: userId,
      },
      data: {
        inviteId: id,
      },
    });

    return create;
  }

  async createOrgAndUser(
    body: Omit<CreateOrgUserDto, 'providerToken'> & { providerId?: string },
    hasEmail: boolean,
    ip: string,
    userAgent: string,
    language?: string | null
  ) {
    return this._organization.model.organization.create({
      data: {
        name: body.company,
        apiKey: AuthService.fixedEncryption(makeSecureId(20)),
        language: language ?? null,
        allowTrial: true,
        isTrailing: true,
        // Perfil Default criado junto com a org; o criador (SUPERADMIN) tem
        // acesso implicito, sem ProfileMember. O marcador impede que o seed
        // de backfill (one-time) conceda memberships em orgs novas.
        profilesBootstrappedAt: new Date(),
        profiles: {
          create: {
            name: 'Default',
            slug: 'default',
            isDefault: true,
          },
        },
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: {
              create: {
                activated: body.provider !== 'LOCAL' || !hasEmail,
                email: body.email,
                password: body.password
                  ? AuthService.hashPassword(body.password)
                  : '',
                providerName: body.provider,
                providerId: body.providerId || '',
                timezone: 0,
                ip,
                agent: userAgent,
              },
            },
          },
        },
      },
      select: {
        id: true,
        users: {
          select: {
            user: true,
          },
        },
      },
    });
  }

  getOrgByCustomerId(customerId: string) {
    return this._organization.model.organization.findFirst({
      where: {
        paymentId: customerId,
      },
    });
  }

  async setStreak(organizationId: string, type: 'start' | 'end') {
    try {
      await this._organization.model.organization.update({
        where: {
          id: organizationId,
          ...(type === 'start'
            ? {
                streakSince: null,
              }
            : {}),
        },
        data: {
          ...(type === 'end' ? { streakSince: null } : {}),
          ...(type === 'start' ? { streakSince: new Date() } : {}),
        },
      });
    } catch (err) {}
  }

  async getTeam(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            role: true,
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
                sendStreakEmails: true,
              },
            },
          },
        },
      },
    });
  }

  getAllUsersOrgs(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        users: {
          select: {
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
              },
            },
          },
        },
      },
    });
  }

  // Destinatarios de e-mail de notificacao escopados por perfil: admins/superadmins
  // sempre; demais, apenas se forem membros do perfil dono do canal. profileId
  // nulo => notificacao org-wide (todos os membros, comportamento anterior).
  async getUsersForNotification(orgId: string, profileId?: string | null) {
    const userOrgs = await this._userOrg.model.userOrganization.findMany({
      where: {
        organizationId: orgId,
        ...(profileId
          ? {
              OR: [
                { role: { in: [Role.ADMIN, Role.SUPERADMIN] } },
                {
                  user: {
                    profileMembers: {
                      // escopa a membership a ESTA org (um usuario pode ter
                      // perfis em varias orgs) — defense-in-depth caso um
                      // (orgId, profileId) inconsistente chegue aqui.
                      some: { profileId, profile: { organizationId: orgId } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            sendSuccessEmails: true,
            sendFailureEmails: true,
          },
        },
      },
    });
    return userOrgs.map((u) => u.user);
  }

  // Usado pelo digest/streak (via activity). Retorna o idioma da org e, por
  // usuario, role + profileIds (escopados nesta org) + preferencias de e-mail,
  // para o workflow filtrar destinatarios por perfil sem tocar o banco.
  getTeamForNotifications(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        language: true,
        users: {
          select: {
            role: true,
            user: {
              select: {
                email: true,
                id: true,
                sendSuccessEmails: true,
                sendFailureEmails: true,
                sendStreakEmails: true,
                profileMembers: {
                  where: {
                    profile: {
                      organizationId: orgId,
                      deletedAt: null,
                    },
                  },
                  select: {
                    profileId: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async deleteTeamMember(orgId: string, userId: string) {
    // Remove tambem as memberships de perfil da org — sem isso, um reconvite
    // do mesmo usuario ressuscitaria os acessos antigos sem passar pela
    // selecao de perfis do convite.
    await this._profileMember.model.profileMember.deleteMany({
      where: {
        userId,
        profile: { organizationId: orgId },
      },
    });
    return this._userOrg.model.userOrganization.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });
  }

  disableOrEnableNonSuperAdminUsers(orgId: string, disable: boolean) {
    return this._userOrg.model.userOrganization.updateMany({
      where: {
        organizationId: orgId,
        role: {
          not: Role.SUPERADMIN,
        },
      },
      data: {
        disabled: disable,
      },
    });
  }

  getShortlinkPreference(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        shortlink: true,
      },
    });
  }

  updateShortlinkPreference(orgId: string, shortlink: ShortLinkPreference) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        shortlink,
      },
    });
  }

  getLanguage(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        language: true,
      },
    });
  }

  updateLanguage(orgId: string, language: string) {
    return this._organization.model.organization.update({
      where: {
        id: orgId,
      },
      data: {
        language,
      },
    });
  }

  // Idioma dos e-mails de conta (forgot/resend) para um usuario possivelmente
  // multi-org: usa a org mais antiga (a criada no cadastro, onde o locale foi
  // capturado). Fallback fica com o chamador (normalizeLang -> 'pt').
  async getFirstOrgLanguageByUserId(userId: string) {
    const org = await this._organization.model.organization.findFirst({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        language: true,
      },
    });
    return org?.language ?? null;
  }

  getZernioApiKey(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: { id: orgId },
      select: { zernioApiKey: true },
    });
  }

  saveZernioApiKey(orgId: string, encryptedKey: string) {
    return this._organization.model.organization.update({
      where: { id: orgId },
      data: { zernioApiKey: encryptedKey },
    });
  }

  removeZernioApiKey(orgId: string) {
    return this._organization.model.organization.update({
      where: { id: orgId },
      data: { zernioApiKey: null },
    });
  }

  getShareZernioWithProfiles(orgId: string) {
    return this._organization.model.organization.findUnique({
      where: { id: orgId },
      select: { shareZernioWithProfiles: true },
    });
  }

  updateShareZernioWithProfiles(orgId: string, enabled: boolean) {
    return this._organization.model.organization.update({
      where: { id: orgId },
      data: { shareZernioWithProfiles: enabled },
    });
  }
}
