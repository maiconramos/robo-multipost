import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Integration } from '@prisma/client';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import {
  AuthTokenDetails,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { TemporalService } from 'nestjs-temporal-core';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { decryptIntegrationToken } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';
import { MetaSystemUserService } from '@gitroom/nestjs-libraries/integrations/meta-system-user.service';

@Injectable()
export class RefreshIntegrationService {
  constructor(
    private _integrationManager: IntegrationManager,
    @Inject(forwardRef(() => IntegrationService))
    private _integrationService: IntegrationService,
    private _temporalService: TemporalService,
    private _encryption: EncryptionService,
    private _metaSystemUser: MetaSystemUserService
  ) {}
  async refresh(integration: Integration, cause = ''): Promise<false | AuthTokenDetails> {
    const socialProvider = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );

    const refresh = await this.refreshProcess(integration, socialProvider, cause);

    if (!refresh) {
      return false as const;
    }

    await this._integrationService.createOrUpdateIntegration(
      undefined,
      !!socialProvider.oneTimeToken,
      integration.organizationId,
      integration.name,
      integration.picture!,
      'social',
      integration.internalId,
      integration.providerIdentifier,
      refresh.accessToken,
      refresh.refreshToken,
      refresh.expiresIn
    );

    return refresh;
  }

  public async setBetweenSteps(integration: Integration) {
    await this._integrationService.setBetweenRefreshSteps(integration.id);
    await this._integrationService.informAboutRefreshError(
      integration.organizationId,
      integration
    );
  }

  public async startRefreshWorkflow(orgId: string, id: string, integration: SocialProvider) {
    if (!integration.refreshCron) {
      return false;
    }

    return this._temporalService.client
      .getRawClient()
      ?.workflow.start(`refreshTokenWorkflow`, {
        workflowId: `refresh_${id}`,
        args: [{integrationId: id, organizationId: orgId}],
        taskQueue: 'main',
        workflowIdConflictPolicy: 'TERMINATE_EXISTING',
      });
  }

  /**
   * Self-heal no boot: garante o workflow SINGLETON de refresh proativo em lote
   * (`refresh-tokens-cron`) rodando. Idempotente via USE_EXISTING (no-op quando
   * ja roda). Cobre TODOS os providers (linkedin, instagram-facebook, etc.),
   * nao so os que tem `refreshCron` por-canal. Chamado pelo StartupMigrationService.
   */
  public async ensureRefreshTokensCronWorkflow() {
    const intervalHours = Number(process.env.TOKEN_REFRESH_INTERVAL_HOURS) || 24;

    return this._temporalService.client
      .getRawClient()
      ?.workflow.start(`refreshTokensCronWorkflow`, {
        workflowId: 'refresh-tokens-cron',
        args: [{ intervalHours }],
        taskQueue: 'main',
        workflowIdConflictPolicy: 'USE_EXISTING',
      });
  }

  private async refreshProcess(
    integration: Integration,
    socialProvider: SocialProvider,
    cause = ''
  ): Promise<AuthTokenDetails | false> {
    // Resolve credenciais por workspace antes do refresh — o refresh_token
    // foi emitido pelo client do workspace e tem que ser refrescado com o
    // MESMO client_id/secret. Sem isso o Google rejeita com invalid_grant
    // e a integracao entra em loop de "precisa reconectar".
    const dbCredentials = await this._integrationManager.getProviderCredentials(
      integration.providerIdentifier,
      integration.organizationId,
      integration.profileId || undefined
    );
    const clientInformation = dbCredentials
      ? {
          client_id: dbCredentials.clientId || '',
          client_secret: dbCredentials.clientSecret || '',
          instanceUrl: dbCredentials.instanceUrl || '',
        }
      : undefined;

    // Motivo sanitizado (name+message) capturado do .catch para persistir em
    // Integration.refreshError (tela de Status). NUNCA contem o token.
    let reason: string | undefined;
    const refresh: false | AuthTokenDetails = await socialProvider
      .refreshToken(
        decryptIntegrationToken(this._encryption, integration.refreshToken),
        clientInformation
      )
      .catch((err) => {
        // Observabilidade: sem isto o motivo real do refresh (refresh token
        // expirado, invalid_grant, escopo faltando...) sumia. Loga SOMENTE
        // name+message — NUNCA o objeto de erro cru: o `RefreshToken`
        // (social.abstract) carrega em `details[].body` o corpo da requisicao,
        // que contem o refresh_token/client_secret. `message` costuma vir vazio,
        // por isso NAO ha fallback para `err` (serializar o objeto vazaria o token).
        reason = `${(err as Error)?.name || 'Error'}: ${
          (err as Error)?.message || 'sem detalhe'
        }`;
        console.error(
          `[refresh] provider=${integration.providerIdentifier} integration=${integration.id} org=${integration.organizationId} refresh falhou: ${reason}`
        );
        return false as const;
      });

    if (!refresh || !refresh.accessToken) {
      // Self-heal Meta: o token OAuth humano morreu (checkpoint da Meta
      // invalidou a sessao), mas com um token de Usuario do Sistema
      // configurado da para re-derivar o Page Access Token sem reconexao
      // manual. Retorna AQUI (antes do bloco reConnect legado abaixo): o
      // heal ja veio do reConnect, e o caller refresh() persiste o token.
      const healed = await this._metaSystemUser.resolveHealedToken(
        integration,
        socialProvider
      );
      if (healed?.accessToken) {
        return healed;
      }

      // Ponto unico: marca desconectado (transicao atomica) + notifica uma vez +
      // persiste o motivo. Substitui o antigo refreshNeeded + informAboutRefreshError +
      // disconnectChannel, que disparava a notificacao/e-mail em duplicidade.
      await this._integrationService.disconnectChannel(
        integration.organizationId,
        integration,
        reason ?? 'Refresh returned no access token'
      );

      return false;
    }

    if (
      !socialProvider.reConnect ||
      integration.rootInternalId === integration.internalId
    ) {
      return refresh;
    }

    const reConnect = await socialProvider.reConnect(
      integration.rootInternalId,
      integration.internalId,
      refresh.accessToken
    );

    return {
      ...refresh,
      ...reConnect,
    };
  }
}
