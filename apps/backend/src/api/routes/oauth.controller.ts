import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OAuthService } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { User, Organization, Profile } from '@prisma/client';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { getOrgRole } from '@gitroom/nestjs-libraries/user/org.role';
import { AuthorizeOAuthQueryDto, ApproveOAuthDto } from '@gitroom/nestjs-libraries/dtos/oauth/authorize-oauth.dto';
import { TokenExchangeDto } from '@gitroom/nestjs-libraries/dtos/oauth/token-exchange.dto';
import { resolveClientCredentials } from '@gitroom/nestjs-libraries/chat/oauth-types';
import { oauthRedirectUrl } from '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.redirect';

@ApiTags('OAuth')
@Controller('/oauth')
export class OAuthController {
  constructor(private _oauthService: OAuthService) {}

  @Get('/authorize')
  async authorize(@Query() query: AuthorizeOAuthQueryDto) {
    const app = await this._oauthService.validateAuthorizationRequest(
      query.client_id
    );

    return {
      app: {
        name: app.name,
        description: app.description,
        picture: app.picture,
        clientId: app.clientId,
        redirectUrl: app.redirectUrl,
      },
      state: query.state,
    };
  }

  @Post('/token')
  // RFC 6749 §5.1: resposta de sucesso e 200; clientes estritos recusam o 201
  // padrao do Nest (upstream 1752382c)
  @HttpCode(200)
  async token(
    @Body() body: TokenExchangeDto,
    @Headers('authorization') authorization?: string
  ) {
    if (body.grant_type !== 'authorization_code') {
      throw new HttpException(
        { error: 'unsupported_grant_type' },
        HttpStatus.BAD_REQUEST
      );
    }

    // client_secret_basic (header) ou client_secret_post (corpo) — #2093
    const credentials = resolveClientCredentials(authorization, body);
    if (!credentials) {
      throw new HttpException(
        { error: 'invalid_client' },
        HttpStatus.UNAUTHORIZED
      );
    }

    return this._oauthService.exchangeCodeForToken(
      body.code,
      credentials.clientId,
      credentials.clientSecret
    );
  }
}

@ApiTags('OAuth')
@Controller('/oauth')
export class OAuthAuthorizedController {
  constructor(private _oauthService: OAuthService) {}

  @Post('/authorize')
  async approveOrDeny(
    @Body() body: ApproveOAuthDto,
    @GetUserFromRequest() user: User,
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    const app = await this._oauthService.validateAuthorizationRequest(
      body.client_id
    );

    if (body.action === 'deny') {
      const redirectUrl = oauthRedirectUrl(app.redirectUrl);
      redirectUrl.searchParams.set('error', 'access_denied');
      if (body.state) {
        redirectUrl.searchParams.set('state', body.state);
      }
      return { redirect: redirectUrl.toString() };
    }

    // membro USER aprova so para o proprio perfil ativo; ADMIN/SUPERADMIN
    // para a org inteira (o ProfileAccessGuard ja barra USER sem perfil e
    // VIEWER nesta rota)
    const profileId = getOrgRole(org) === 'USER' ? profile?.id ?? null : null;
    if (getOrgRole(org) === 'USER' && !profileId) {
      throw new HttpException(
        { error: 'access_denied', error_description: 'No profile selected' },
        HttpStatus.FORBIDDEN
      );
    }

    const code = await this._oauthService.createAuthorizationCode(
      app.id,
      user.id,
      org.id,
      profileId
    );

    const redirectUrl = oauthRedirectUrl(app.redirectUrl);
    redirectUrl.searchParams.set('code', code);
    if (body.state) {
      redirectUrl.searchParams.set('state', body.state);
    }
    return { redirect: redirectUrl.toString() };
  }
}
