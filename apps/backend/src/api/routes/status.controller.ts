import { Controller, Get, Query } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { StatusService } from '@gitroom/nestjs-libraries/database/prisma/status/status.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Status')
@Controller('/status')
export class StatusController {
  constructor(private _statusService: StatusService) {}

  /**
   * Problemas pendentes do workspace (canais desconectados, posts com erro,
   * automacoes falhas), com o perfil de origem por item. Admin-only:
   * `Sections.ADMIN` garante 403 (AdminRoleRequiredException) mesmo sem Stripe —
   * NAO usar HttpForbiddenException (o filtro global o converteria em 401+logout).
   * Admin/superadmin sempre passam no ProfileAccessGuard (leitura org-wide).
   */
  @Get('/problems')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  async getProblems(
    @GetOrgFromRequest() org: Organization,
    @Query('profileId') profileId?: string
  ) {
    return this._statusService.getProblems(org, profileId);
  }
}
