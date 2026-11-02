import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IntegrationRepository } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsData,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration, Organization } from '@prisma/client';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { difference, uniq } from 'lodash';
import utc from 'dayjs/plugin/utc';
import { AutopostRepository } from '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { TemporalService } from 'nestjs-temporal-core';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { decryptIntegrationToken } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';
import { StatusEventService } from '@gitroom/nestjs-libraries/database/prisma/status/status-event.service';
import { MetaSystemUserService } from '@gitroom/nestjs-libraries/integrations/meta-system-user.service';

dayjs.extend(utc);

@Injectable()
export class IntegrationService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _autopostsRepository: AutopostRepository,
    private _integrationManager: IntegrationManager,
    private _notificationService: NotificationService,
    @Inject(forwardRef(() => RefreshIntegrationService))
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _encryption: EncryptionService,
    private _statusEventService: StatusEventService,
    private _metaSystemUser: MetaSystemUserService
  ) {}

  async changeActiveCron(orgId: string) {
    const data = await this._autopostsRepository.getAutoposts(orgId);

    for (const item of data.filter((f) => f.active)) {
      try {
        await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
      } catch (err) {}
    }

    return true;
  }

  getMentions(platform: string, q: string) {
    return this._integrationRepository.getMentions(platform, q);
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    return this._integrationRepository.insertMentions(platform, mentions);
  }

  async setTimes(
    orgId: string,
    integrationId: string,
    times: IntegrationTimeDto
  ) {
    return this._integrationRepository.setTimes(orgId, integrationId, times);
  }

  updateProviderSettings(org: string, id: string, additionalSettings: string) {
    return this._integrationRepository.updateProviderSettings(
      org,
      id,
      additionalSettings
    );
  }

  checkPreviousConnections(org: string, id: string) {
    return this._integrationRepository.checkPreviousConnections(org, id);
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string,
    profileId?: string
  ) {
    let uploadedPicture: string | undefined;
    if (picture) {
      if (
        picture.indexOf('imagedelivery.net') > -1 ||
        picture.startsWith('/icons/')
      ) {
        uploadedPicture = picture;
      } else {
        try {
          uploadedPicture = await this.storage.uploadSimple(picture);
        } catch (err) {
          // Avatar e cosmetico: uma falha de storage (ex.: credencial R2 errada)
          // NAO pode derrubar a conexao do canal — o OAuth ja deu certo. Mantem a
          // URL original do provider (publica e utilizavel).
          console.error(
            `[integration] falha ao subir avatar na conexao (mantendo original): ${
              (err as Error)?.name || 'Error'
            }: ${(err as Error)?.message || 'sem detalhe'}`
          );
          uploadedPicture = picture;
        }
      }
    }

    return this._integrationRepository.createOrUpdateIntegration(
      additionalSettings,
      oneTimeToken,
      org,
      name,
      uploadedPicture,
      type,
      internalId,
      provider,
      token,
      refreshToken,
      expiresIn,
      username,
      isBetweenSteps,
      refresh,
      timezone,
      customInstanceDetails,
      profileId
    );
  }

  setIntegrationProfile(id: string, profileId: string) {
    return this._integrationRepository.setIntegrationProfile(id, profileId);
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integrationRepository.updateIntegrationGroup(org, id, group);
  }

  updateOnCustomerName(org: string, id: string, name: string) {
    return this._integrationRepository.updateOnCustomerName(org, id, name);
  }

  getIntegrationsList(org: string, profileId?: string) {
    return this._integrationRepository.getIntegrationsList(org, profileId);
  }

  getIntegrationForOrder(id: string, order: string, user: string, org: string) {
    return this._integrationRepository.getIntegrationForOrder(
      id,
      order,
      user,
      org
    );
  }

  updateCustomName(org: string, id: string, name: string) {
    return this._integrationRepository.updateCustomName(org, id, name);
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integrationRepository.updateNameAndUrl(id, name, url);
  }

  getIntegrationById(org: string, id: string) {
    return this._integrationRepository.getIntegrationById(org, id);
  }

  // perfil do canal da org com esse internalId (inclusive desativado) — para
  // checar quem pode reconectar
  async getChannelProfileByInternalId(org: string, internalId: string) {
    const channel =
      await this._integrationRepository.findActiveByOrgAndInternalIdWithProfile(
        org,
        internalId
      );
    return channel ? { profileId: channel.profileId ?? null } : null;
  }

  getIntegrationsByInternalId(internalId: string) {
    return this._integrationRepository.getIntegrationsByInternalId(internalId);
  }

  async refreshToken(
    provider: SocialProvider,
    refresh: string,
    organizationId?: string,
    profileId?: string | null
  ) {
    try {
      // Resolve credenciais por workspace antes do refresh — refresh_token
      // foi emitido pelo client do workspace e tem que ser refrescado com o
      // mesmo client_id/secret. Sem isso o Google rejeita com invalid_grant
      // e a integracao entra em loop de "precisa reconectar".
      let clientInformation;
      if (organizationId) {
        const dbCredentials =
          await this._integrationManager.getProviderCredentials(
            provider.identifier,
            organizationId,
            profileId || undefined
          );
        if (dbCredentials) {
          clientInformation = {
            client_id: dbCredentials.clientId || '',
            client_secret: dbCredentials.clientSecret || '',
            instanceUrl: dbCredentials.instanceUrl || '',
          };
        }
      }

      const { refreshToken, accessToken, expiresIn } =
        await provider.refreshToken(refresh, clientInformation);

      if (!refreshToken || !accessToken || !expiresIn) {
        return false;
      }

      return { refreshToken, accessToken, expiresIn };
    } catch (e) {
      return false;
    }
  }

  /**
   * Marca o canal como precisando reconectar e notifica o usuario UMA unica
   * vez — apenas na transicao false->true (guarda atomica no repository). Evita
   * e-mail/sininho duplicados quando o batch de refresh e o post-time (ou os
   * varios call-sites de disconnectChannel) atingem a mesma integration.
   */
  async disconnectChannel(
    orgId: string,
    integration: Integration,
    reason?: string
  ) {
    const transitioned = await this._integrationRepository.markRefreshNeeded(
      orgId,
      integration.id,
      reason
    );
    if (transitioned) {
      await this.informAboutRefreshError(orgId, integration);
      // Histórico (fail-soft): registra a queda no log só na transição real
      // (o gate `transitioned` evita duplicar quando vários call-sites atingem
      // a mesma integration). `reason` já vem sanitizado (name+message).
      await this._statusEventService.record({
        organizationId: orgId,
        type: 'CHANNEL_DISCONNECT',
        severity: 'CRITICAL',
        message: reason ?? null,
        profileId: integration.profileId ?? null,
        integrationId: integration.id,
        channelName: integration.name,
        channelPicture: integration.picture ?? null,
        providerIdentifier: integration.providerIdentifier,
      });
    }
  }

  async informAboutRefreshError(orgId: string, integration: Integration) {
    await this._notificationService.inAppNotification(
      orgId,
      {
        subjectKey: 'notif_channel_refresh_failed_subject',
        messageKey: 'notif_channel_refresh_failed',
        params: {
          name: integration.name,
          provider: integration.providerIdentifier,
          url: `${process.env.FRONTEND_URL}/launches`,
        },
        profileId: integration.profileId ?? null,
      },
      true,
      false,
      'info'
    );
  }

  async refreshNeeded(org: string, id: string) {
    return this._integrationRepository.refreshNeeded(org, id);
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integrationRepository.setBetweenRefreshSteps(id);
  }

  async refreshTokens() {
    const integrations = await this._integrationRepository.needsToBeRefreshed();
    for (const integration of integrations) {
      try {
        const provider = this._integrationManager.getSocialIntegration(
          integration.providerIdentifier
        );

        const data = await this.refreshToken(
          provider,
          decryptIntegrationToken(this._encryption, integration.refreshToken),
          integration.organizationId,
          integration.profileId
        );

        if (!data) {
          // Self-heal Meta: com token de Usuario do Sistema configurado,
          // re-deriva o Page Access Token (FB/IG via Facebook Login) e
          // persiste sem desconectar.
          const healed = await this._metaSystemUser.resolveHealedToken(
            integration,
            provider
          );
          if (healed) {
            await this.createOrUpdateIntegration(
              undefined,
              !!provider.oneTimeToken,
              integration.organizationId,
              integration.name,
              undefined,
              'social',
              integration.internalId,
              integration.providerIdentifier,
              healed.accessToken,
              healed.refreshToken,
              healed.expiresIn
            );
            continue;
          }

          if (provider.noNativeRefresh) {
            // FB/IG (Facebook Login) nao tem refresh nativo: o stub retorna
            // vazio SEMPRE. Sem System User token nao ha como renovar em
            // lote — mas o Page Access Token pode continuar valido (a
            // expiracao registrada e sintetica). Desconectar aqui era falso
            // positivo que derrubava canal saudavel na janela de expiracao.
            // A morte real do token e detectada e tratada no post-time
            // (RefreshIntegrationService.refreshProcess).
            continue;
          }

          // Nao conseguiu renovar: marca desconectado + notifica uma vez.
          // `continue` (NAO `return`) para nao abortar o lote inteiro por causa
          // de um unico canal quebrado.
          await this.disconnectChannel(
            integration.organizationId,
            integration,
            'Automatic token refresh failed'
          );
          continue;
        }

        const { refreshToken, accessToken, expiresIn } = data;

        await this.createOrUpdateIntegration(
          undefined,
          !!provider.oneTimeToken,
          integration.organizationId,
          integration.name,
          undefined,
          'social',
          integration.internalId,
          integration.providerIdentifier,
          accessToken,
          refreshToken,
          expiresIn
        );
      } catch (err) {
        // Erro inesperado (ex.: provider desconhecido, decrypt falhou) nao pode
        // derrubar o refresh dos demais canais. Resumo redigido, nunca o objeto
        // cru (pode carregar corpo de requisicao com refresh_token).
        console.error(
          `[refresh-tokens] integration=${integration.id} org=${integration.organizationId} falhou: ${summarizeError(err)}`
        );
      }
    }
  }

  async validateIntegrationProfile(
    orgId: string,
    integrationId: string,
    profileId?: string,
    opts?: { requireProfile?: boolean }
  ) {
    if (!profileId) {
      // Org USER sempre opera com perfil resolvido; sem ele, negar em vez de
      // degradar para escopo org-wide. Admins e chaves de org passam.
      if (opts?.requireProfile) {
        throw new HttpException(
          'Profile context required for this operation',
          HttpStatus.FORBIDDEN
        );
      }
      return;
    }
    const integration = await this._integrationRepository.getIntegrationById(orgId, integrationId);
    // HttpException (nao Error): um Error vira 500 no filtro global e a API
    // publica documenta 403/404 para chave de perfil fora do escopo.
    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (integration.profileId && integration.profileId !== profileId) {
      throw new HttpException(
        'Integration does not belong to this profile',
        HttpStatus.FORBIDDEN
      );
    }
  }

  async disableChannel(org: string, id: string) {
    return this._integrationRepository.disableChannel(org, id);
  }

  async enableChannel(org: string, totalChannels: number, id: string, profileId?: string) {
    const integrations = (
      await this._integrationRepository.getIntegrationsList(org, profileId)
    ).filter((f) => !f.disabled);
    if (
      !!process.env.STRIPE_PUBLISHABLE_KEY &&
      integrations.length >= totalChannels
    ) {
      throw new Error('You have reached the maximum number of channels');
    }

    return this._integrationRepository.enableChannel(org, id);
  }

  async getPostsForChannel(org: string, id: string) {
    return this._integrationRepository.getPostsForChannel(org, id);
  }

  async deleteChannel(org: string, id: string) {
    return this._integrationRepository.deleteChannel(org, id);
  }

  async disableIntegrations(org: string, totalChannels: number) {
    return this._integrationRepository.disableIntegrations(org, totalChannels);
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
  }

  async saveProviderPage(org: string, id: string, data: any) {
    const getIntegration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!getIntegration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (!getIntegration.inBetweenSteps) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    const provider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (!provider.fetchPageInformation) {
      throw new HttpException(
        'Provider does not support page selection',
        HttpStatus.BAD_REQUEST
      );
    }

    getIntegration.token = decryptIntegrationToken(
      this._encryption,
      getIntegration.token
    );
    // Erros do provider nesta etapa sao de acesso/permissao a Pagina ("no
    // permission to manage this page", "Page not found") e precisam chegar a
    // tela de conexao com a mensagem, nao como 500 "Internal server error".
    const getIntegrationInformation = await provider
      .fetchPageInformation(getIntegration.token, data)
      .catch((err: unknown) => {
        if (err instanceof HttpException) {
          throw err;
        }
        throw new HttpException(
          err instanceof Error && err.message
            ? err.message
            : 'Failed to fetch page information',
          HttpStatus.BAD_REQUEST
        );
      });

    // Antes de salvar, verifica se o canal ja existe em outro perfil da mesma
    // org. Sem essa checagem, o updateIntegration faria upsert silencioso na
    // integracao existente, mantendo o profileId antigo e deixando o user
    // achando que adicionou no perfil X quando na verdade ficou no perfil Y.
    const conflicting =
      await this._integrationRepository.findActiveByOrgAndInternalIdWithProfile(
        org,
        String(getIntegrationInformation.id)
      );
    if (
      conflicting &&
      conflicting.id !== id &&
      conflicting.profileId !== getIntegration.profileId
    ) {
      const profileName =
        (conflicting as any).clientProfile?.name || 'outro perfil';
      throw new HttpException(
        `Canal ja conectado no perfil "${profileName}". Remova de la antes de conectar aqui.`,
        HttpStatus.CONFLICT
      );
    }

    await this.checkForDeletedOnceAndUpdate(
      org,
      String(getIntegrationInformation.id)
    );
    await this._integrationRepository.updateIntegration(id, {
      picture: getIntegrationInformation.picture,
      internalId: String(getIntegrationInformation.id),
      organizationId: org,
      name: getIntegrationInformation.name,
      inBetweenSteps: false,
      token: getIntegrationInformation.access_token,
      profile: getIntegrationInformation.username,
    });

    return { success: true };
  }

  async checkAnalytics(
    org: Organization,
    integration: string,
    date: string,
    forceRefresh = false,
    profileId?: string
  ): Promise<AnalyticsData[]> {
    const getIntegration = await this.getIntegrationById(org.id, integration);

    if (!getIntegration) {
      throw new HttpException('Invalid integration', HttpStatus.NOT_FOUND);
    }

    if (profileId && getIntegration.profileId && getIntegration.profileId !== profileId) {
      throw new HttpException(
        'Integration does not belong to this profile',
        HttpStatus.FORBIDDEN
      );
    }

    if (getIntegration.type !== 'social') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this.disconnectChannel(org.id, getIntegration);
        return [];
      }
    }

    // dias ausentes ou invalidos em chamadas da API publica: mesmo padrao do
    // app (upstream 96b78476)
    const requestedDays = Number(date);
    const days =
      Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : 7;
    const getIntegrationData = await ioRedis.get(
      `integration:analytics-v2:${org.id}:${integration}:${days}`
    );
    if (getIntegrationData) {
      return JSON.parse(getIntegrationData);
    }

    if (integrationProvider.analytics) {
      try {
        // Decifra in-place: analytics recebe o objeto getIntegration e pode ler
        // .token internamente. No-op se :457 ja reatribuiu um accessToken puro.
        getIntegration.token = decryptIntegrationToken(
          this._encryption,
          getIntegration.token
        );
        const loadAnalytics = await integrationProvider.analytics(
          getIntegration.internalId,
          getIntegration.token,
          days,
          getIntegration
        );
        await ioRedis.set(
          `integration:analytics-v2:${org.id}:${integration}:${days}`,
          JSON.stringify(loadAnalytics),
          'EX',
          !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
            ? 1
            : 3600
        );
        return loadAnalytics;
      } catch (e) {
        // uma nova tentativa so: sem isto a recursao nao terminava
        if (e instanceof RefreshToken && !forceRefresh) {
          return this.checkAnalytics(org, integration, date, true, profileId);
        }
      }
    }

    return [];
  }

  customers(orgId: string) {
    return this._integrationRepository.customers(orgId);
  }

  // renomear grupo de canais (upstream #2183). O grupo vale para a org
  // inteira: um USER so renomeia grupo cujos canais sao todos do seu perfil.
  async updateCustomerName(
    orgId: string,
    id: string,
    name: string,
    requireProfileId?: string | null
  ) {
    const customer = await this._integrationRepository.getCustomer(orgId, id);
    if (!customer) {
      throw new HttpException('Group not found', HttpStatus.NOT_FOUND);
    }

    if (requireProfileId !== undefined) {
      const outside = requireProfileId
        ? await this._integrationRepository.countCustomerIntegrationsOutsideProfile(
            orgId,
            id,
            requireProfileId
          )
        : 1;
      if (outside > 0) {
        throw new HttpException(
          'This group has channels from other profiles',
          HttpStatus.FORBIDDEN
        );
      }
    }

    const exists = await this._integrationRepository.getCustomerByName(
      orgId,
      name
    );
    if (exists && exists.id !== id) {
      throw new HttpException(
        'A group with this name already exists',
        HttpStatus.BAD_REQUEST
      );
    }
    return this._integrationRepository.updateCustomerName(orgId, id, name);
  }

  getPlugsByIntegrationId(org: string, integrationId: string) {
    return this._integrationRepository.getPlugsByIntegrationId(
      org,
      integrationId
    );
  }

  async processInternalPlug(
    data: {
      post: string;
      originalIntegration: string;
      integration: string;
      plugName: string;
      orgId: string;
      delay: number;
      information: any;
    },
    forceRefresh = false
  ): Promise<any> {
    const originalIntegration =
      await this._integrationRepository.getIntegrationById(
        data.orgId,
        data.originalIntegration
      );

    const getIntegration = await this._integrationRepository.getIntegrationById(
      data.orgId,
      data.integration
    );

    if (!getIntegration || !originalIntegration || getIntegration.disabled) {
      return;
    }
    // canal alvo precisa ser do mesmo perfil do canal do post (ou sem perfil):
    // settings vem do cliente e nao podem agir com o token de outro perfil
    if (
      getIntegration.profileId &&
      getIntegration.profileId !== originalIntegration.profileId
    ) {
      return;
    }
    // Plug methods leem .token de AMBAS as integracoes internamente.
    getIntegration.token = decryptIntegrationToken(
      this._encryption,
      getIntegration.token
    );
    originalIntegration.token = decryptIntegrationToken(
      this._encryption,
      originalIntegration.token
    );

    const getAllInternalPlugs = this._integrationManager
      .getInternalPlugs(getIntegration.providerIdentifier)
      .internalPlugs.find((p: any) => p.identifier === data.plugName);

    if (!getAllInternalPlugs) {
      return;
    }

    const getSocialIntegration = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    // @ts-ignore
    await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(
      getIntegration,
      originalIntegration,
      data.post,
      data.information
    );

    return;
  }

  async processPlugs(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    const getPlugById = await this._integrationRepository.getPlug(data.plugId);
    if (!getPlugById) {
      return true;
    }
    // Plug method le getPlugById.integration.token internamente.
    getPlugById.integration.token = decryptIntegrationToken(
      this._encryption,
      getPlugById.integration.token
    );

    // Defesa em profundidade para linhas gravadas antes da validacao: so
    // metodos marcados com @Plug do provider sao invocaveis por nome (mesma
    // classe da CVE-2026-115931). `true` encerra o workflow do plug.
    if (
      !this.findRegisteredPlug(
        getPlugById.integration.providerIdentifier,
        getPlugById.plugFunction
      )
    ) {
      const safeName = String(getPlugById.plugFunction)
        .slice(0, 64)
        .replace(/[^\w.-]/g, '?');
      console.warn(
        `[plugs] funcao nao registrada ignorada: ${getPlugById.integration.providerIdentifier}.${safeName}`
      );
      return true;
    }

    const integration = this._integrationManager.getSocialIntegration(
      getPlugById.integration.providerIdentifier
    );

    // @ts-ignore
    const process = await integration[getPlugById.plugFunction](
      getPlugById.integration,
      data.postId,
      JSON.parse(getPlugById.data).reduce((all: any, current: any) => {
        all[current.name] = current.value;
        return all;
      }, {})
    );

    if (process) {
      return true;
    }

    if (data.totalRuns === data.currentRun) {
      return true;
    }

    return false;
  }

  private findRegisteredPlug(providerIdentifier: string, methodName: string) {
    return this._integrationManager
      .getAllPlugs()
      .find((p) => p.identifier === providerIdentifier)
      ?.plugs.find((plug: { methodName: string }) => plug.methodName === methodName);
  }

  async createOrUpdatePlug(
    orgId: string,
    integrationId: string,
    body: PlugDto
  ) {
    // canal da propria org (o upsert era por integrationId cru) e func
    // restrito aos @Plug do provider, com os campos que ele declara
    const integration = await this._integrationRepository.getIntegrationById(
      orgId,
      integrationId
    );
    if (!integration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    const plug = this.findRegisteredPlug(
      integration.providerIdentifier,
      body.func
    );
    if (!plug) {
      throw new HttpException('Plug not found', HttpStatus.BAD_REQUEST);
    }
    const declared = new Set(
      (plug.fields || []).map((field: { name: string }) => field.name)
    );
    if ((body.fields || []).some((field) => !declared.has(field.name))) {
      throw new HttpException('Unknown plug field', HttpStatus.BAD_REQUEST);
    }

    const { activated } = await this._integrationRepository.createOrUpdatePlug(
      orgId,
      integrationId,
      body
    );

    return {
      activated,
    };
  }

  async changePlugActivation(
    orgId: string,
    plugId: string,
    status: boolean,
    profileId?: string,
    opts?: { requireProfile?: boolean }
  ) {
    // mesmo escopo das demais rotas de canal: o plug precisa ser da org e o
    // canal dele, do perfil resolvido
    const plug = await this._integrationRepository.getPlugForOrg(orgId, plugId);
    if (!plug) {
      throw new HttpException('Plug not found', HttpStatus.NOT_FOUND);
    }
    await this.validateIntegrationProfile(
      orgId,
      plug.integrationId,
      profileId,
      opts
    );

    const { id } = await this._integrationRepository.changePlugActivation(
      orgId,
      plugId,
      status
    );

    return { id };
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._integrationRepository.getPlugs(orgId, integrationId);
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    const exisingData = await this._integrationRepository.loadExisingData(
      methodName,
      integrationId,
      id
    );
    const loadOnlyIds = exisingData.map((p) => p.value);
    return difference(id, loadOnlyIds);
  }

  async findFreeDateTime(
    orgId: string,
    integrationsId?: string
  ): Promise<number[]> {
    const findTimes = await this._integrationRepository.getPostingTimes(
      orgId,
      integrationsId
    );
    return uniq(
      findTimes.reduce((all: any, current: any) => {
        return [
          ...all,
          ...JSON.parse(current.postingTimes).map(
            (p: { time: number }) => p.time
          ),
        ];
      }, [] as number[])
    );
  }
}
