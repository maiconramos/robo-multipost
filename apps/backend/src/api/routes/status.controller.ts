import { Controller, Get, Query } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { StatusService } from '@gitroom/nestjs-libraries/database/prisma/status/status.service';
import { StatusEventService } from '@gitroom/nestjs-libraries/database/prisma/status/status-event.service';
import { InfraHealthService } from '@gitroom/nestjs-libraries/database/prisma/status/infra-health.service';
import { StatusHistoryQueryDto } from '@gitroom/nestjs-libraries/dtos/status/status-history.query.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Status')
@Controller('/status')
export class StatusController {
  constructor(
    private _statusService: StatusService,
    private _statusEventService: StatusEventService,
    private _infraHealthService: InfraHealthService
  ) {}

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

  /**
   * Histórico de eventos de falha (canal caído, post falho, automação falha) que
   * SOBREVIVEM à resolução — paginado por cursor, filtrável por tipo/severidade/
   * perfil. Mesmo guard admin-only do /problems. `message` já vem sanitizado da
   * origem; a leitura é sempre escopada à org via @GetOrgFromRequest.
   */
  @Get('/history')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  async getHistory(
    @GetOrgFromRequest() org: Organization,
    @Query() query: StatusHistoryQueryDto
  ) {
    return this._statusEventService.list(org.id, query);
  }

  /**
   * Sonda ativa de saúde da infra (PostgreSQL/Redis/Temporal/Storage). Mesmo
   * guard admin-only. Health é global (infra compartilhada do self-host); o
   * `@GetOrgFromRequest` mantém o padrão do guard. `?refresh=true` ignora o
   * cache de 30s (botão "Verificar agora").
   */
  @Get('/health')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  async getHealth(
    @GetOrgFromRequest() _org: Organization,
    @Query('refresh') refresh?: string
  ) {
    return this._infraHealthService.getHealth(refresh === 'true');
  }
}
