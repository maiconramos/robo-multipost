import { Injectable } from '@nestjs/common';
import { Integration } from '@prisma/client';
import {
  AuthTokenDetails,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';

// Page Access Token derivado de um System User token que "nunca expira"
// tambem nao expira. 10 anos empurra Integration.tokenExpiration para longe
// da janela do refresh-tokens-cron (needsToBeRefreshed: <= now+1d), entao o
// canal curado sai do lote diario.
export const SYSTEM_USER_PAGE_TOKEN_TTL = 10 * 365 * 24 * 60 * 60;

// Somente os providers Meta via Facebook Login sao curaveis: o token de
// publicacao deles e um Page Access Token re-derivavel a partir do token de
// Usuario do Sistema do Business Manager. instagram-standalone fica de fora
// (tem refresh nativo proprio via ig_refresh_token).
const HEALABLE_PROVIDERS = new Set(['facebook', 'instagram']);

/**
 * Self-heal de publicacao FB/IG: quando o token OAuth humano morre
 * (checkpoint de seguranca da Meta invalida as sessoes da conta), re-deriva
 * um Page Access Token novo a partir do token de Usuario do Sistema —
 * que nao tem sessao humana e nunca sofre checkpoint. Chamado pelos dois
 * pontos que hoje desconectam o canal: RefreshIntegrationService.refreshProcess
 * (post-time) e IntegrationService.refreshTokens (cron em lote).
 */
@Injectable()
export class MetaSystemUserService {
  constructor(private _credentialService: CredentialService) {}

  async resolveHealedToken(
    integration: Integration,
    socialProvider: SocialProvider
  ): Promise<AuthTokenDetails | null> {
    if (
      !HEALABLE_PROVIDERS.has(integration.providerIdentifier) ||
      !socialProvider.reConnect
    ) {
      return null;
    }

    const systemUserToken = await this._credentialService.getSystemUserToken(
      integration.organizationId,
      integration.profileId || undefined
    );
    if (!systemUserToken) {
      return null;
    }

    try {
      // reConnect de facebook/instagram ignora o 1o argumento (id) e resolve
      // pelo 2o (requiredId): Page ID no facebook, IG business account id no
      // instagram — que e exatamente o internalId de cada um. Mesmo padrao do
      // call-site legado em refreshProcess (rootInternalId no slot ignorado).
      // Se a assinatura/semantica do reConnect mudar, revisar aqui.
      const reconnected = await socialProvider.reConnect(
        integration.internalId,
        integration.internalId,
        systemUserToken
      );
      if (!reconnected?.accessToken) {
        return null;
      }

      return {
        ...reconnected,
        refreshToken: reconnected.accessToken,
        expiresIn: SYSTEM_USER_PAGE_TOKEN_TTL,
      };
    } catch (err) {
      // Loga SOMENTE name+message — nunca o objeto de erro cru, que pode
      // carregar o token do system user no corpo da requisicao.
      console.error(
        `[meta-system-user] heal falhou provider=${
          integration.providerIdentifier
        } integration=${integration.id} org=${integration.organizationId}: ${
          (err as Error)?.name || 'Error'
        }: ${(err as Error)?.message || 'sem detalhe'}`
      );
      return null;
    }
  }
}
