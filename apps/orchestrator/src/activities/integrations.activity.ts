import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { Integration } from '@prisma/client';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';

@Injectable()
@Activity()
export class IntegrationsActivity {
  constructor(
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService
  ) {}

  @ActivityMethod()
  async getIntegrationsById(id: string, orgId: string) {
    return this._integrationService.getIntegrationById(orgId, id);
  }

  async refreshToken(integration: Integration) {
    return this._refreshIntegrationService.refresh(integration);
  }

  // Refresh proativo em lote de todos os canais cujo token expira em <= 1 dia.
  // Acionado pelo refreshTokensCronWorkflow (singleton diario). A logica mora no
  // service; a activity so embrulha para o Temporal.
  @ActivityMethod()
  async refreshExpiringTokens() {
    return this._integrationService.refreshTokens();
  }
}
