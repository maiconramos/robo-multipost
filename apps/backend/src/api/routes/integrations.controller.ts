import { DenyViewer } from '@gitroom/nestjs-libraries/services/auth/profile-access/profile-access.decorators';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  Logger,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ThrottlerOrgUserGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import {
  FarcasterChannelSignerDto,
  FarcasterSignerStatusDto,
} from '@gitroom/nestjs-libraries/dtos/integrations/farcaster.signer.dto';
import { FarcasterSignerService } from '@gitroom/nestjs-libraries/integrations/social/farcaster.signer.service';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile, User } from '@prisma/client';
import { IntegrationFunctionDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.function.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { ApiTags } from '@nestjs/swagger';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationTimeDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.time.dto';
import { PlugDto } from '@gitroom/nestjs-libraries/dtos/plugs/plug.dto';
import { CustomerNameDto } from '@gitroom/nestjs-libraries/dtos/integrations/customer.name.dto';
import { ProviderPageDto } from '@gitroom/nestjs-libraries/dtos/integrations/provider.page.dto';
import { IntegrationNameDto } from '@gitroom/nestjs-libraries/dtos/integrations/integration.name.dto';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

import { timer } from '@gitroom/helpers/utils/timer';
import { TelegramProvider } from '@gitroom/nestjs-libraries/integrations/social/telegram.provider';
import { TelegramUpdatesDto } from '@gitroom/nestjs-libraries/dtos/integrations/telegram.updates.dto';
import { MoltbookProvider } from '@gitroom/nestjs-libraries/integrations/social/moltbook.provider';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { uniqBy } from 'lodash';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { getOrgRole } from '@gitroom/nestjs-libraries/user/org.role';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { decryptIntegrationToken } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';
import { isCrossSiteRequest } from '@gitroom/nestjs-libraries/services/auth/csrf.origin';

@ApiTags('Integrations')
@Controller('/integrations')
export class IntegrationsController {
  constructor(
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _postService: PostsService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _organizationService: OrganizationService,
    private _profileService: ProfileService,
    private _encryption: EncryptionService,
    private _farcasterSignerService: FarcasterSignerService
  ) {}

  @Post('/provider/:id/connect')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async saveProviderPage(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: ProviderPageDto
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    const { state: _state, ...page } = body;
    void _state;
    return this._integrationService.saveProviderPage(org.id, id, page);
  }

  @Get('/:identifier/internal-plugs')
  getInternalPlugs(@Param('identifier') identifier: string) {
    return this._integrationManager.getInternalPlugs(identifier);
  }

  @Get('/customers')
  getCustomers(@GetOrgFromRequest() org: Organization) {
    return this._integrationService.customers(org.id);
  }

  @Put('/customers/:id')
  async updateCustomerName(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: CustomerNameDto
  ) {
    return this._integrationService.updateCustomerName(
      org.id,
      id,
      body.name,
      getOrgRole(org) === 'USER' ? profile?.id ?? null : undefined
    );
  }

  @Put('/:id/custom-name')
  async updateCustomName(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: IntegrationNameDto
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.updateCustomName(org.id, id, body.name);
  }

  @Put('/:id/group')
  async updateIntegrationGroup(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: { group: string }
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.updateIntegrationGroup(
      org.id,
      id,
      body.group
    );
  }

  @Put('/:id/customer-name')
  async updateOnCustomerName(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: { name: string }
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.updateOnCustomerName(org.id, id, body.name);
  }

  @Get('/list')
  async getIntegrationList(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return {
      integrations: await Promise.all(
        (
          await this._integrationService.getIntegrationsList(
            org.id,
            profile?.id
          )
        ).map(async (p) => {
          const findIntegration = this._integrationManager.getSocialIntegration(
            p.providerIdentifier
          );
          return {
            // nome do Robo MultiPost quando definido (upstream #2190)
            name: p.customName || p.name,
            originalName: p.name,
            id: p.id,
            internalId: p.internalId,
            disabled: p.disabled,
            editor: findIntegration.editor,
            picture: p.picture || '/no-picture.jpg',
            identifier: p.providerIdentifier,
            inBetweenSteps: p.inBetweenSteps,
            refreshNeeded: p.refreshNeeded,
            isCustomFields: !!findIntegration.customFields,
            ...(findIntegration.customFields
              ? { customFields: await findIntegration.customFields() }
              : {}),
            display: p.profile,
            type: p.type,
            time: JSON.parse(p.postingTimes),
            changeProfilePicture: !!findIntegration?.changeProfilePicture,
            changeNickName: !!findIntegration?.changeNickname,
            customer: p.customer,
            additionalSettings: p.additionalSettings || '[]',
          };
        })
      ),
    };
  }

  @Post('/:id/settings')
  async updateProviderSettings(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body('additionalSettings') body: string
  ) {
    if (typeof body !== 'string') {
      throw new Error('Invalid body');
    }

    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    await this._integrationService.updateProviderSettings(org.id, id, body);
  }
  @Post('/:id/nickname')
  async setNickname(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: { name: string; picture: string }
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    const integration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );
    if (!integration) {
      throw new Error('Invalid integration');
    }
    integration.token = decryptIntegrationToken(
      this._encryption,
      integration.token
    );

    const manager = this._integrationManager.getSocialIntegration(
      integration.providerIdentifier
    );
    if (!manager.changeProfilePicture && !manager.changeNickname) {
      throw new Error('Invalid integration');
    }

    const { url } = manager.changeProfilePicture
      ? await manager.changeProfilePicture(
          integration.internalId,
          integration.token,
          body.picture
        )
      : { url: '' };

    const { name } = manager.changeNickname
      ? await manager.changeNickname(
          integration.internalId,
          integration.token,
          body.name
        )
      : { name: '' };

    return this._integrationService.updateNameAndUrl(id, name, url);
  }

  @Get('/:id')
  getSingleIntegration(
    @Param('id') id: string,
    @Query('order') order: string,
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization
  ) {
    return this._integrationService.getIntegrationForOrder(
      id,
      order,
      user.id,
      org.id
    );
  }

  @Get('/social/:integration')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  @DenyViewer()
  async getIntegrationUrl(
    @Param('integration') integration: string,
    @Query('refresh') refresh: string,
    @Query('externalUrl') externalUrl: string,
    @Query('onboarding') onboarding: string,
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Req() req?: Request
  ) {
    // GET com efeito colateral: com ?refresh= o token antigo e revogado no
    // provider. O guard de CSRF so cobre POST/PUT/PATCH/DELETE, e o cookie
    // (SameSite=None) vai junto num <img> ou link de outro site.
    if (refresh && req && isCrossSiteRequest(req as any)) {
      throw new HttpException({ message: 'CSRF_ORIGIN_MISMATCH' }, 403);
    }
    if (
      !this._integrationManager
        .getAllowedSocialsIntegrations()
        .includes(integration)
    ) {
      throw new Error('Integration not allowed');
    }

    const integrationProvider =
      this._integrationManager.getSocialIntegration(integration);

    const isZernioProvider = integration.startsWith('zernio-');

    if (integrationProvider.externalUrl && !externalUrl && !isZernioProvider) {
      throw new Error('Missing external url');
    }

    // membro USER so reconecta canal do proprio perfil (ou legado sem perfil),
    // inclusive desativado — igual a API publica
    if (refresh && getOrgRole(org) === 'USER') {
      const existing =
        await this._integrationService.getChannelProfileByInternalId(
          org.id,
          refresh
        );
      if (existing?.profileId && existing.profileId !== profile?.id) {
        throw new HttpException(
          { msg: 'Channel belongs to another profile' },
          403
        );
      }
    }

    try {
      let getExternalUrl:
        | { client_id: string; client_secret: string; instanceUrl: string }
        | undefined;

      if (isZernioProvider) {
        let zernioApiKey: string | null = null;
        if (profile?.id) {
          zernioApiKey = await this._profileService.getDecryptedZernioApiKey(
            profile.id
          );
          // If profile has no key, check if org shares Zernio with profiles
          if (!zernioApiKey) {
            const shareSettings =
              await this._organizationService.getShareZernioWithProfiles(
                org.id
              );
            if (shareSettings?.shareZernioWithProfiles) {
              zernioApiKey =
                await this._organizationService.getDecryptedZernioApiKey(
                  org.id
                );
            }
          }
        } else {
          // No active profile — use org-level key
          zernioApiKey =
            await this._organizationService.getDecryptedZernioApiKey(org.id);
        }
        if (!zernioApiKey) {
          throw new Error(
            'Zernio API key not configured. Go to Settings > Zernio to configure it.'
          );
        }
        getExternalUrl = {
          client_id: '',
          client_secret: '',
          instanceUrl: zernioApiKey,
        };
      } else if (integrationProvider.externalUrl) {
        getExternalUrl = {
          ...(await integrationProvider.externalUrl(externalUrl)),
          instanceUrl: externalUrl,
        };
      }

      // Look up per-workspace credentials from DB (falls back to env vars inside providers)
      if (!getExternalUrl) {
        const dbCreds = await this._integrationManager.getProviderCredentials(
          integration,
          org.id,
          profile?.id
        );
        if (dbCreds) {
          // Threads uses a separate Meta app (Threads App) with its own
          // ID/Secret, stored under the Threads section of the Meta
          // credentials form. Fall back to the Facebook App pair only when
          // the workspace hasn't filled in the Threads-specific fields.
          if (integration === 'threads') {
            getExternalUrl = {
              client_id: dbCreds.threadsAppId || dbCreds.clientId || '',
              client_secret:
                dbCreds.threadsAppSecret || dbCreds.clientSecret || '',
              instanceUrl: '',
            };
          } else if (integration === 'instagram-standalone') {
            // Instagram Login API usa o App do produto "Instagram" (Instagram
            // App ID/Secret). Se o workspace nao preencheu os campos dedicados,
            // cai nos campos gerais (clientId/clientSecret do Facebook) como
            // fallback — mesmo App Meta serve se tiver os dois produtos.
            getExternalUrl = {
              client_id: dbCreds.instagramAppId || dbCreds.clientId || '',
              client_secret:
                dbCreds.instagramAppSecret || dbCreds.clientSecret || '',
              instanceUrl: '',
            };
          } else {
            getExternalUrl = {
              client_id: dbCreds.clientId || '',
              client_secret: dbCreds.clientSecret || '',
              instanceUrl: '',
            };
          }
        }
      }

      // Antes de redirecionar para o consent, revoga programaticamente o
      // token antigo se o provider suportar. Isso forca a tela de consent a
      // aparecer de novo (mesmo quando a conta ja autorizou o app), evitando
      // que o Google emita um auth code sem refresh_token associado.
      if (refresh && integrationProvider.revokeToken) {
        const matches =
          await this._integrationService.getIntegrationsByInternalId(refresh);
        // membro USER so revoga o token de canal que alcanca (proprio perfil
        // ou canal legado sem perfil); admin sem restricao
        const restrictTo =
          getOrgRole(org) === 'USER' ? profile?.id ?? null : undefined;
        const existing = matches.find(
          (i) =>
            i.organizationId === org.id &&
            // mesmo provider da URL: o internalId sozinho pode casar canal
            // de outra rede
            i.providerIdentifier === integration &&
            (restrictTo === undefined ||
              !i.profileId ||
              i.profileId === restrictTo)
        );
        if (existing?.token) {
          await integrationProvider.revokeToken(
            decryptIntegrationToken(this._encryption, existing.token)
          );
        }
      }

      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl(getExternalUrl);

      if (refresh) {
        await ioRedis.set(`refresh:${state}`, refresh, 'EX', 3600);
      }

      if (onboarding === 'true') {
        await ioRedis.set(`onboarding:${state}`, 'true', 'EX', 3600);
      }

      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(`login:${state}`, codeVerifier, 'EX', 3600);
      await ioRedis.set(
        `external:${state}`,
        JSON.stringify(getExternalUrl),
        'EX',
        3600
      );

      if (profile?.id) {
        await ioRedis.set(`profile:${state}`, profile.id, 'EX', 3600);
      }

      return { url };
    } catch (err) {
      return { err: true };
    }
  }

  @Post('/:id/time')
  async setTime(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: IntegrationTimeDto
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.setTimes(org.id, id, body);
  }

  @Post('/mentions')
  async mentions(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: IntegrationFunctionDto
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      body.id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    const getIntegration = await this._integrationService.getIntegrationById(
      org.id,
      body.id
    );
    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    let newList: any[] | { none: true } = [];
    try {
      // Esta rota so busca mencoes: o nome do metodo e fixo, nunca o do
      // cliente (CVE-2026-115931).
      newList =
        (await this.functionIntegration(org, profile, {
          ...body,
          name: 'mention',
        })) || [];
    } catch (err) {
      Logger.warn(
        `mention lookup failed: ${summarizeError(err)}`,
        'IntegrationsController'
      );
    }

    if (!Array.isArray(newList) && newList?.none) {
      return newList;
    }

    const list = await this._integrationService.getMentions(
      getIntegration.providerIdentifier,
      body?.data?.query
    );

    if (Array.isArray(newList) && newList.length) {
      await this._integrationService.insertMentions(
        getIntegration.providerIdentifier,
        newList
          .map((p: any) => ({
            name: p.label || '',
            username: p.id || '',
            image: p.image || '',
            doNotCache: p.doNotCache || false,
          }))
          .filter((f: any) => f.name && !f.doNotCache)
      );
    }

    return uniqBy(
      [
        ...list.map((p) => ({
          id: p.username,
          image: p.image,
          label: p.name,
        })),
        ...(newList as any[]),
      ],
      (p) => p.id
    ).filter((f) => f.label && f.id);
  }

  @Post('/function')
  async functionIntegration(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: IntegrationFunctionDto
  ): Promise<any> {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      body.id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    const getIntegration = await this._integrationService.getIntegrationById(
      org.id,
      body.id
    );
    if (!getIntegration) {
      throw new Error('Invalid integration');
    }
    getIntegration.token = decryptIntegrationToken(
      this._encryption,
      getIntegration.token
    );

    const integrationProvider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );
    if (!integrationProvider) {
      throw new Error('Invalid provider');
    }

    // Allowlist: so metodos @Tool ou @DashboardFunction podem ser executados
    // pelo nome vindo do cliente (CVE-2026-115931 — leitura arbitraria de
    // arquivo / crash via helpers internos do provider).
    if (
      this._integrationManager.isDashboardCallable(
        integrationProvider,
        body.name
      )
    ) {
      try {
        const load = await (integrationProvider as any)[body.name](
          getIntegration.token,
          body.data,
          getIntegration.internalId,
          getIntegration
        );

        return load;
      } catch (err) {
        if (err instanceof RefreshToken) {
          const data = await this._refreshIntegrationService.refresh(
            getIntegration
          );

          if (!data) {
            return;
          }

          const { accessToken } = data;

          if (accessToken) {
            if (integrationProvider.refreshWait) {
              await timer(10000);
            }
            return this.functionIntegration(org, profile, body);
          }

          return false;
        }

        return false;
      }
    }
    throw new Error('Function not found');
  }

  @Post('/disable')
  async disableChannel(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body('id') id: string
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.disableChannel(org.id, id);
  }

  @Post('/enable')
  async enableChannel(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body('id') id: string
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.enableChannel(
      org.id,
      // @ts-ignore
      org?.subscription?.totalChannels || pricing.FREE.channel,
      id,
      profile?.id
    );
  }

  @Delete('/')
  async deleteChannel(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body('id') id: string
  ) {
    // o mesmo valor vai para filtros Prisma: objeto ({ not: ... }) casaria
    // canais de outros perfis no soft-delete dos posts
    if (typeof id !== 'string' || !id) {
      throw new HttpException('Invalid integration id', 400);
    }
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    const isTherePosts = await this._integrationService.getPostsForChannel(
      org.id,
      id
    );
    if (isTherePosts.length) {
      for (const post of isTherePosts) {
        this._postService.deletePost(org.id, post.group).catch((err) => {});
      }
    }

    return this._integrationService.deleteChannel(org.id, id);
  }

  @Get('/plug/list')
  async getPlugList() {
    return { plugs: this._integrationManager.getAllPlugs() };
  }

  @Get('/:id/plugs')
  async getPlugsByIntegrationId(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.getPlugsByIntegrationId(org.id, id);
  }

  @Post('/:id/plugs')
  async postPlugsByIntegrationId(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: PlugDto
  ) {
    await this._integrationService.validateIntegrationProfile(
      org.id,
      id,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
    return this._integrationService.createOrUpdatePlug(org.id, id, body);
  }

  @Put('/plugs/:id/activate')
  async changePlugActivation(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body('status') status: boolean
  ) {
    return this._integrationService.changePlugActivation(
      org.id,
      id,
      status,
      profile?.id,
      { requireProfile: getOrgRole(org) === 'USER' }
    );
  }

  @Get('/telegram/updates')
  async getUpdates(@Query() query: TelegramUpdatesDto) {
    return new TelegramProvider().getBotId(query);
  }

  // Conexao de canal Farcaster (managed signer, upstream #2078/#2080). O
  // upstream usa as rotas publicas de /auth tambem aqui; no fork o canal passa
  // por rotas autenticadas: o signer fica no registro amarrado a org/usuario/
  // perfil de quem o criou e ao state do /social/wrapcast, que o connect
  // confere e consome (uso unico). Patrocinio da Neynar so aqui.
  @Post('/farcaster/signer')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  @UseGuards(ThrottlerOrgUserGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  async farcasterSigner(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: FarcasterChannelSignerDto
  ) {
    return this._farcasterSignerService.startChannel(body.state, {
      orgId: org.id,
      userId: user.id,
      profileId: profile?.id || null,
    });
  }

  // o modal consulta a cada 2 s por ate 10 min; o requestId vai no corpo
  @Post('/farcaster/signer/status')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  @UseGuards(ThrottlerOrgUserGuard)
  @Throttle({ default: { limit: 1000, ttl: 3600000 } })
  async farcasterSignerStatus(
    @GetOrgFromRequest() org: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: FarcasterSignerStatusDto
  ) {
    return this._farcasterSignerService.channelStatus(body.requestId, {
      orgId: org.id,
      userId: user.id,
    });
  }

  @Post('/moltbook/register')
  async moltbookRegister(@Body() body: { name: string; description: string }) {
    try {
      const provider = new MoltbookProvider();
      const result = await provider.registerAgent(body.name, body.description);
      return {
        apiKey: result.api_key,
        claimUrl: result.claim_url,
        verificationCode: result.verification_code,
      };
    } catch (err: any) {
      return { error: err.message || 'Registration failed' };
    }
  }

  @Get('/moltbook/status')
  async moltbookStatus(@Query('apiKey') apiKey: string) {
    try {
      const provider = new MoltbookProvider();
      const result = await provider.checkAgentStatus(apiKey);
      return { claimed: result?.status === 'claimed' };
    } catch (err) {
      return { claimed: false };
    }
  }
}
