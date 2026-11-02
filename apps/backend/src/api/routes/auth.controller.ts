import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ThrottlerFarcasterLoginGuard,
  ThrottlerLocalLoginGuard,
  ThrottlerRealIpGuard,
} from '@gitroom/nestjs-libraries/throttler/throttler.provider';
import {
  FARCASTER_LOGIN_COOKIE,
  FarcasterSignerService,
} from '@gitroom/nestjs-libraries/integrations/social/farcaster.signer.service';
import { FARCASTER_SIGNER_TTL_SECONDS } from '@gitroom/nestjs-libraries/integrations/social/farcaster.signer.registry';
import { FarcasterSignerStatusDto } from '@gitroom/nestjs-libraries/dtos/integrations/farcaster.signer.dto';
import { Response, Request } from 'express';

import { CreateOrgUserDto } from '@gitroom/nestjs-libraries/dtos/auth/create.org.user.dto';
import { LoginUserDto } from '@gitroom/nestjs-libraries/dtos/auth/login.user.dto';
import { AuthService } from '@gitroom/backend/services/auth/auth.service';
import { ForgotReturnPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot-return.password.dto';
import { ForgotPasswordDto } from '@gitroom/nestjs-libraries/dtos/auth/forgot.password.dto';
import { ResendActivationDto } from '@gitroom/nestjs-libraries/dtos/auth/resend-activation.dto';
import { ApiTags } from '@nestjs/swagger';
import { getCookieUrlFromDomain } from '@gitroom/helpers/subdomain/subdomain.management';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { RealIP } from 'nestjs-real-ip';
import {
  AcceptLanguage,
  UserAgent,
} from '@gitroom/nestjs-libraries/user/user.agent';
import { Provider } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { isNotSecured } from '@gitroom/helpers/utils/not.secured';

const FARCASTER = 'FARCASTER';

// mesmas flags do cookie `auth`; vida do registro do signer
const farcasterCookieOptions = () => ({
  domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
  httpOnly: true,
  ...(!isNotSecured()
    ? { secure: true, sameSite: 'none' as const }
    : {}),
  expires: new Date(Date.now() + FARCASTER_SIGNER_TTL_SECONDS * 1000),
});

@ApiTags('Auth')
@Controller('/auth')
export class AuthController {
  constructor(
    private _authService: AuthService,
    private _emailService: EmailService,
    private _farcasterSignerService: FarcasterSignerService
  ) {}

  @Get('/can-register')
  async canRegister() {
    return {
      register: await this._authService.canRegister(Provider.LOCAL as string),
    };
  }

  @UseGuards(ThrottlerFarcasterLoginGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post('/register')
  async register(
    @Req() req: Request,
    @Body() body: CreateOrgUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string,
    @AcceptLanguage() acceptLanguage: string
  ) {
    try {
      const farcaster = body.provider === FARCASTER;
      if (farcaster) {
        await this._farcasterSignerService.claimLoginCode(
          body.providerToken,
          req?.cookies?.[FARCASTER_LOGIN_COOKIE]
        );
      }

      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, addedOrg } = await this._authService.routeAuth(
        body.provider,
        body,
        ip,
        userAgent,
        getOrgFromCookie,
        acceptLanguage
      );

      if (farcaster) {
        await this.consumeFarcasterLogin(body.providerToken, response);
      }

      const activationRequired =
        body.provider === 'LOCAL' && this._emailService.hasProvider();

      if (activationRequired) {
        response.header('activate', 'true');
        response.status(200).json({ activate: true });
        return;
      }

      response.cookie('auth', jwt, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!isNotSecured()
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      if (isNotSecured()) {
        response.header('auth', jwt);
      }

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, {
          domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
          ...(!isNotSecured()
            ? {
                secure: true,
                httpOnly: true,
                sameSite: 'none',
              }
            : {}),
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        });

        if (isNotSecured()) {
          response.header('showorg', addedOrg.organizationId);
        }
      }

      Sentry.metrics.count('new_user', 1);
      response.header('onboarding', 'true');
      response.status(200).json({
        register: true,
      });
    } catch (e: any) {
      response.status(400).send(e.message);
    }
  }

  // ThrottlerLocalLoginGuard: senha (LOCAL) 20 tentativas / 10 min por IP
  @UseGuards(ThrottlerFarcasterLoginGuard, ThrottlerLocalLoginGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post('/login')
  async login(
    @Req() req: Request,
    @Body() body: LoginUserDto,
    @Res({ passthrough: false }) response: Response,
    @RealIP() ip: string,
    @UserAgent() userAgent: string
  ) {
    try {
      const farcaster = body.provider === FARCASTER;
      if (farcaster) {
        await this._farcasterSignerService.claimLoginCode(
          body.providerToken,
          req?.cookies?.[FARCASTER_LOGIN_COOKIE]
        );
      }

      const getOrgFromCookie = this._authService.getOrgFromCookie(
        req?.cookies?.org
      );

      const { jwt, addedOrg } = await this._authService.routeAuth(
        body.provider,
        body,
        ip,
        userAgent,
        getOrgFromCookie
      );

      if (farcaster) {
        await this.consumeFarcasterLogin(body.providerToken, response);
      }

      response.cookie('auth', jwt, {
        domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
        ...(!isNotSecured()
          ? {
              secure: true,
              httpOnly: true,
              sameSite: 'none',
            }
          : {}),
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      });

      if (isNotSecured()) {
        response.header('auth', jwt);
      }

      if (typeof addedOrg !== 'boolean' && addedOrg?.organizationId) {
        response.cookie('showorg', addedOrg.organizationId, {
          domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
          ...(!isNotSecured()
            ? {
                secure: true,
                httpOnly: true,
                sameSite: 'none',
              }
            : {}),
          expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        });

        if (isNotSecured()) {
          response.header('showorg', addedOrg.organizationId);
        }
      }

      response.header('reload', 'true');
      response.status(200).json({
        login: true,
      });
    } catch (e: any) {
      response.status(400).send(e.message);
    }
  }

  @Post('/forgot')
  async forgot(@Body() body: ForgotPasswordDto) {
    try {
      await this._authService.forgot(body.email);
      return {
        forgot: true,
      };
    } catch (e) {
      return {
        forgot: false,
      };
    }
  }

  @Post('/forgot-return')
  async forgotReturn(@Body() body: ForgotReturnPasswordDto) {
    const reset = await this._authService.forgotReturn(body);
    return {
      reset: !!reset,
    };
  }

  @Get('/oauth/:provider')
  async oauthLink(@Param('provider') provider: string, @Query() query: any) {
    return this._authService.oauthLink(provider, query);
  }

  // Login com Farcaster (upstream #2078/#2080): rotas publicas que criam e
  // consultam um managed signer na Neynar. Cada POST cria um signer (custo na
  // conta da Neynar): limite por cliente + teto global, gate do login no
  // service e vinculo ao navegador por cookie httpOnly com nonce aleatorio. O
  // navegador so recebe um requestId opaco.
  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post('/farcaster/signer')
  async farcasterSigner(@Res({ passthrough: true }) response: Response) {
    const { body, nonce } = await this._farcasterSignerService.startLogin();
    if (nonce) {
      response.cookie(FARCASTER_LOGIN_COOKIE, nonce, farcasterCookieOptions());
    }
    return body;
  }

  // o modal consulta a cada 2 s por ate 10 min; o requestId vai no corpo
  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 1000, ttl: 3600000 } })
  @Post('/farcaster/signer/status')
  async farcasterSignerStatus(
    @Req() req: Request,
    @Body() body: FarcasterSignerStatusDto
  ) {
    return this._farcasterSignerService.loginStatus(
      body.requestId,
      req?.cookies?.[FARCASTER_LOGIN_COOKIE]
    );
  }

  // uso unico: apaga o registro e o cookie do vinculo
  private async consumeFarcasterLogin(code: unknown, response: Response) {
    await this._farcasterSignerService.consumeLogin(code);
    response.clearCookie(FARCASTER_LOGIN_COOKIE, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
    });
  }

  @Post('/activate')
  async activate(
    @Body('code') code: string,
    @Body('datafast_visitor_id') datafast_visitor_id: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const activate = await this._authService.activate(code, datafast_visitor_id);
    if (!activate) {
      return response.status(200).json({ can: false });
    }

    response.cookie('auth', activate, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!isNotSecured()
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });

    if (isNotSecured()) {
      response.header('auth', activate);
    }

    response.header('onboarding', 'true');

    return response.status(200).json({ can: true });
  }

  @Post('/resend-activation')
  async resendActivation(@Body() body: ResendActivationDto) {
    try {
      await this._authService.resendActivationEmail(body.email);
      return {
        success: true,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message,
      };
    }
  }

  @Get('/oauth/mobile-callback')
  mobileCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res({ passthrough: false }) response: Response
  ) {
    const scheme = process.env.MOBILE_APP_SCHEME || 'postiz://auth/callback';
    const params = new URLSearchParams();
    if (code) params.set('code', code);
    if (state) params.set('state', state);
    return response.redirect(302, `${scheme}?${params.toString()}`);
  }

  @UseGuards(ThrottlerFarcasterLoginGuard)
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  @Post('/oauth/:provider/exists')
  async oauthExists(
    @Req() req: Request,
    @Body('code') code: string,
    @Body('redirect_uri') redirect_uri: string,
    @Param('provider') provider: string,
    @Res({ passthrough: false }) response: Response
  ) {
    // Farcaster: o code (requestId opaco) so vale no navegador que criou o
    // signer, e e rejeitado antes de qualquer chamada a Neynar
    const farcaster = provider?.toUpperCase() === FARCASTER;
    if (farcaster) {
      await this._farcasterSignerService.claimLoginCode(
        code,
        req?.cookies?.[FARCASTER_LOGIN_COOKIE]
      );
    }

    const { jwt, token } = await this._authService.checkExists(
      provider,
      code,
      redirect_uri
    );

    // conta nova: o mesmo code segue para o /auth/register (consumido la)
    if (token) {
      if (farcaster) await this._farcasterSignerService.releaseLoginClaim(code);
      return response.json({ token });
    }

    if (farcaster) {
      await this.consumeFarcasterLogin(code, response);
    }

    response.cookie('auth', jwt, {
      domain: getCookieUrlFromDomain(process.env.FRONTEND_URL!),
      ...(!isNotSecured()
        ? {
            secure: true,
            httpOnly: true,
            sameSite: 'none',
          }
        : {}),
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });

    if (isNotSecured()) {
      response.header('auth', jwt);
    }

    response.header('reload', 'true');

    response.status(200).json({
      login: true,
    });
  }
}
