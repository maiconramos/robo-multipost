import { encryptExtensionCookiesForStorage } from '@gitroom/nestjs-libraries/integrations/extension.cookies';
import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Res,
  UseFilters,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProviderPageDto } from '@gitroom/nestjs-libraries/dtos/integrations/provider.page.dto';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import { Response } from 'express';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { ConnectIntegrationDto } from '@gitroom/nestjs-libraries/dtos/integrations/connect.integration.dto';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { ApiTags } from '@nestjs/swagger';
import { NotEnoughScopesFilter } from '@gitroom/nestjs-libraries/integrations/integration.missing.scopes';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { AuthTokenDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { NotEnoughScopes } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { ssrfSafeFetch } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

@ApiTags('Integrations')
@Controller('/integrations')
export class NoAuthIntegrationsController {
  constructor(
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _organizationService: OrganizationService
  ) {}

  @Get('/')
  getIntegrations() {
    return this._integrationManager.getAllIntegrations();
  }

  @Post('/social-connect/:integration')
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  @UseFilters(new NotEnoughScopesFilter())
  async connectSocialMedia(
    @Param('integration') integration: string,
    @Body() body: ConnectIntegrationDto
  ) {
    if (
      !this._integrationManager
        .getAllowedSocialsIntegrations()
        .includes(integration)
    ) {
      throw new Error('Integration not allowed');
    }

    const integrationProvider =
      this._integrationManager.getSocialIntegration(integration);

    const getCodeVerifier = integrationProvider.customFields
      ? 'none'
      : await ioRedis.get(`login:${body.state}`);
    if (!getCodeVerifier) {
      // o state vale 1 h e e apagado depois de usado (ex.: recarregar a pagina)
      throw new HttpException(
        'This connection link expired or was already used, please connect the channel again',
        400
      );
    }

    const organization = await ioRedis.get(`organization:${body.state}`);
    if (!organization) {
      throw new Error('Organization not found');
    }

    const org = await this._organizationService.getOrgById(organization);

    // For two-step providers (isBetweenSteps), keep the login state alive so
    // that a page refresh during step-2 selection doesn't cause "Invalid state".
    // The key expires naturally after 1 hour; the auth code itself is one-time
    // and will be rejected by the provider on any subsequent authenticate() call.
    if (!integrationProvider.customFields && !integrationProvider.isBetweenSteps) {
      await ioRedis.del(`login:${body.state}`);
    }

    const details = await ioRedis.get(`external:${body.state}`) || undefined;

    if (details) {
      await ioRedis.del(`external:${body.state}`);
    }

    const refresh = await ioRedis.get(`refresh:${body.state}`);
    if (refresh) {
      await ioRedis.del(`refresh:${body.state}`);
    }

    const onboarding = await ioRedis.get(`onboarding:${body.state}`);
    if (onboarding) {
      await ioRedis.del(`onboarding:${body.state}`);
    }

    const profileId = await ioRedis.get(`profile:${body.state}`) || undefined;
    if (profileId) {
      await ioRedis.del(`profile:${body.state}`);
    }

    const {
      error,
      accessToken,
      expiresIn,
      refreshToken,
      id,
      name,
      picture,
      username,
      additionalSettings,
    } = await (async (): Promise<AuthTokenDetails> => {
      try {
        const auth = await integrationProvider.authenticate(
          {
            code: body.code,
            codeVerifier: getCodeVerifier,
            refresh: body.refresh,
            // Farcaster confere que o code (signer do registro) e deste fluxo
            state: body.state,
          },
          details ? JSON.parse(details) : undefined
        );

        if (typeof auth === 'string') {
          return ({
            error: auth,
            accessToken: '',
            id: '',
            name: '',
            picture: '',
            username: '',
            additionalSettings: [],
          });
        }

        if (refresh && integrationProvider.reConnect) {
          try {
            const newAuth = await integrationProvider.reConnect(
              auth.id,
              refresh,
              auth.accessToken
            );
            // Providers com access token de curta duracao (ex: YouTube) precisam
            // preservar o refresh_token real devolvido pelo OAuth. O caminho
            // default sobrescreve com body.refresh, descartando o refresh_token
            // e quebrando a renovacao automatica horas depois.
            if (integrationProvider.keepReconnectAuthTokens) {
              return ({
                ...newAuth,
                refreshToken: auth.refreshToken,
                expiresIn: auth.expiresIn,
              });
            }
            return ({ ...newAuth, refreshToken: body.refresh });
          } catch (err: any) {
            return ({
              error: err.message,
              accessToken: '',
              id: '',
              name: '',
              picture: '',
              username: '',
              additionalSettings: [],
            });
          }
        }

        return (auth);
      } catch (err) {
        if (err instanceof NotEnoughScopes) {
          return ({
            error: err.message,
            accessToken: '',
            id: '',
            name: '',
            picture: '',
            username: '',
            additionalSettings: [],
          });
        }

        // Loga a causa para diagnosticar falhas silenciosas do OAuth (troca de
        // token da Meta, JSON invalido, credencial ausente...) em vez de so
        // "Authentication failed" — resumida: stack/cause/objeto inteiro
        // podiam levar o corpo da troca de token ao log.
        Logger.error(
          `[connectSocialMedia] ${integration} authenticate() failed: ${summarizeError(err)}`,
          undefined,
          'NoAuthIntegrationsController'
        );

        return ({
          error: 'Authentication failed',
          accessToken: '',
          id: '',
          name: '',
          picture: '',
          username: '',
          additionalSettings: [],
        });
      }
    })();

    if (error) {
      throw new NotEnoughScopes(error);
    }

    if (!id) {
      throw new NotEnoughScopes('Invalid API key');
    }

    if (refresh && String(id) !== String(refresh)) {
      throw new NotEnoughScopes(
        'Please refresh the channel that needs to be refreshed'
      );
    }

    let validName = name;
    if (!validName) {
      if (username) {
        validName = username.split('.')[0] ?? username;
      } else {
        validName = `Channel_${String(id).slice(0, 8)}`;
      }
    }

    if (
      process.env.STRIPE_PUBLISHABLE_KEY &&
      org.isTrailing &&
      (await this._integrationService.checkPreviousConnections(
        org.id,
        String(id)
      ))
    ) {
      throw new HttpException('', 412);
    }

    const createUpdate =
      await this._integrationService.createOrUpdateIntegration(
        additionalSettings,
        !!integrationProvider.oneTimeToken,
        org.id,
        validName.trim(),
        picture,
        'social',
        String(id),
        integration,
        accessToken,
        refreshToken,
        expiresIn,
        username,
        refresh ? false : integrationProvider.isBetweenSteps,
        body.refresh,
        +body.timezone,
        details
          ? AuthService.fixedEncryption(details)
          : integrationProvider.customFields
          ? AuthService.fixedEncryption(
              Buffer.from(body.code, 'base64').toString()
            )
          : integrationProvider.isChromeExtension
          ? // so os cookies declarados pelo provider (mesma whitelist do
            // extension-refresh)
            encryptExtensionCookiesForStorage(integrationProvider, body.code)
          : undefined,
        profileId
      );

    // o passo 2 (escolha da pagina sem login) so vale para o canal criado
    // por este mesmo state
    if (integrationProvider.isBetweenSteps && !refresh) {
      await ioRedis.set(`pending:${body.state}`, createUpdate.id, 'EX', 3600);
    }

    this._refreshIntegrationService
      .startRefreshWorkflow(org.id, createUpdate.id, integrationProvider)
      .catch((err) => {
        Logger.warn(
          `startRefreshWorkflow failed: ${summarizeError(err)}`,
          'NoAuthIntegrationsController'
        );
      });

    // Fetch pages if this is a two-step provider and not a refresh
    let pages: any[] = [];
    if (integrationProvider.isBetweenSteps && !refresh) {
      try {
        // Check which method the provider uses (pages or companies)
        const fetchMethod =
          'pages' in integrationProvider
            ? 'pages'
            : 'companies' in integrationProvider
            ? 'companies'
            : null;

        if (fetchMethod) {
          // @ts-ignore - dynamic method call
          pages = await integrationProvider[fetchMethod](accessToken);
        }
      } catch (err) {
        Logger.warn(
          `Failed to fetch pages: ${summarizeError(err)}`,
          'NoAuthIntegrationsController'
        );
      }
    }

    const webhookUrl = await ioRedis.get(`webhookUrl:${body.state}`);
    if (webhookUrl) {
      try {
        await ssrfSafeFetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            params: AuthService.signJWT({
              apiKey: org.apiKey,
            }),
          }),
        });
      } catch (err) {}

      await ioRedis.del(`webhookUrl:${body.state}`);
    }

    const returnURL = await ioRedis.get(`redirect:${body.state}`);
    if (returnURL) {
      await ioRedis.del(`redirect:${body.state}`);
    }

    const extensionToken = integrationProvider.isChromeExtension
      ? AuthService.signJWT({
          integrationId: createUpdate.id,
          organizationId: org.id,
          internalId: String(id),
          provider: integration,
        })
      : undefined;

    // Never leak stored credentials (signed/encrypted secrets) back to the
    // caller. These columns hold the integration access token, refresh token
    // and encrypted custom instance details and must stay server-side.
    const {
      token: _token,
      refreshToken: _refreshToken,
      customInstanceDetails: _customInstanceDetails,
      ...safeIntegration
    } = createUpdate as any;

    return {
      ...safeIntegration,
      onboarding: onboarding === 'true',
      pages,
      ...(returnURL ? { returnURL } : {}),
      ...(extensionToken ? { extensionToken } : {}),
    };
  }

  @Post('/public/provider/:id/connect')
  // rota sem login: so os campos da escolha da pagina chegam ao provider
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async saveProviderPage(
    @Param('id') id: string,
    @Body() body: ProviderPageDto
  ) {
    if (!body.state) {
      // o state vale 1 h e e apagado depois de usado (ex.: recarregar a pagina)
      throw new HttpException(
        'This connection link expired or was already used, please connect the channel again',
        400
      );
    }

    const organization = await ioRedis.get(`organization:${body.state}`);
    const pendingId = await ioRedis.get(`pending:${body.state}`);
    if (!organization || !pendingId || pendingId !== id) {
      throw new HttpException(
        'This connection link expired or was already used, please connect the channel again',
        400
      );
    }

    const org = await this._organizationService.getOrgById(organization);

    const { state: _state, ...page } = body;
    void _state;
    const result = await this._integrationService.saveProviderPage(
      org.id,
      id,
      page
    );
    // state consumido: nao serve para outra escolha de pagina
    await ioRedis.del(`pending:${body.state}`);
    await ioRedis.del(`organization:${body.state}`);
    await ioRedis.del(`login:${body.state}`);
    return result;
  }

  @Get('/zernio/callback')
  async zernioCallback(
    @Query('accountId') accountId: string,
    @Query('profileId') profileId: string,
    @Query('platform') platform: string,
    @Query('state') state: string,
    @Res() res: Response
  ) {
    if (!accountId || !state) {
      throw new HttpException('Missing required parameters', 400);
    }

    const provider = `zernio-${platform}`;

    // Redirect to frontend with the account data
    const redirectUrl = `${process.env.FRONTEND_URL}/integrations/social/${provider}?code=${encodeURIComponent(accountId)}&state=${encodeURIComponent(state)}`;
    return res.redirect(redirectUrl);
  }

  @Post('/extension-refresh')
  async extensionRefreshCookies(
    @Body() body: { jwt: string; cookies: string }
  ) {
    let payload: any;
    try {
      payload = AuthService.verifyJWT(body.jwt);
    } catch {
      throw new HttpException('Invalid token', 401);
    }

    const { integrationId, organizationId, internalId, provider } = payload;
    if (
      typeof integrationId !== 'string' ||
      !integrationId ||
      typeof organizationId !== 'string' ||
      !organizationId ||
      typeof internalId !== 'string' ||
      !internalId ||
      typeof provider !== 'string' ||
      !provider ||
      'timeLimit' in payload || // convite de equipe
      'expires' in payload || // reset de senha
      'providerName' in payload // login
    ) {
      throw new HttpException('Invalid token payload', 400);
    }

    const integration = await this._integrationService.getIntegrationById(
      organizationId,
      integrationId
    );
    if (
      !integration ||
      integration.internalId !== internalId ||
      integration.providerIdentifier !== provider
    ) {
      throw new HttpException('Integration not found', 404);
    }

    const integrationProvider =
      this._integrationManager.getSocialIntegration(provider);
    if (!integrationProvider?.isChromeExtension) {
      throw new HttpException('Not a Chrome extension integration', 400);
    }

    const authResult = await integrationProvider.authenticate({
      code: body.cookies,
      codeVerifier: '',
    });

    if (typeof authResult === 'string') {
      throw new HttpException(authResult, 400);
    }

    if (String(authResult.id) !== String(integration.internalId)) {
      await this._integrationService.refreshNeeded(
        organizationId,
        integrationId
      );
      return { success: false, reason: 'account_mismatch' };
    }

    await this._integrationService.createOrUpdateIntegration(
      undefined,
      false,
      organizationId,
      integration.name,
      undefined,
      'social',
      integration.internalId,
      integration.providerIdentifier,
      authResult.accessToken,
      '',
      authResult.expiresIn,
      undefined,
      false,
      undefined,
      undefined,
      // Cookies declarados pelo provider, cifrados em AES. Antes, o JSON vindo
      // do cliente era ASSINADO com JWT_SECRET — oraculo para forjar tokens.
      encryptExtensionCookiesForStorage(integrationProvider, body.cookies),
      integration.profileId || undefined
    );

    return { success: true };
  }
}
