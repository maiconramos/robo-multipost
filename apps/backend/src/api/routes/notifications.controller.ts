import { Controller, Get } from '@nestjs/common';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { Organization, Role, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { getOrgRole } from '@gitroom/nestjs-libraries/user/org.role';
import { ApiTags } from '@nestjs/swagger';
import { SkipProfileAccess } from '@gitroom/nestjs-libraries/services/auth/profile-access/profile-access.decorators';

@ApiTags('Notifications')
@SkipProfileAccess()
@Controller('/notifications')
export class NotificationsController {
  constructor(
    private _notificationsService: NotificationService,
    private _profileService: ProfileService
  ) {}

  // Escopo do sininho por perfil: admin/superadmin veem tudo; demais veem apenas
  // notificacoes org-wide ou dos perfis a que pertencem. Resolvido por query,
  // sem reintroduzir o ProfileAccessGuard (rota @SkipProfileAccess).
  private async resolveScope(user: User, organization: Organization) {
    const role = getOrgRole(organization);
    const isAdmin = role === Role.ADMIN || role === Role.SUPERADMIN;
    const profileIds = isAdmin
      ? []
      : await this._profileService.getUserProfileIds(
          user.id,
          organization.id
        );
    return { isAdmin, profileIds };
  }

  @Get('/')
  async mainPageList(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization
  ) {
    return this._notificationsService.getMainPageCount(
      organization.id,
      user.id,
      await this.resolveScope(user, organization)
    );
  }

  @Get('/list')
  async notifications(
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() organization: Organization
  ) {
    return this._notificationsService.getNotifications(
      organization.id,
      user.id,
      await this.resolveScope(user, organization)
    );
  }
}
