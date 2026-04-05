import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Credentials')
@Controller('/credentials')
export class CredentialsController {
  constructor(private _credentialService: CredentialService) {}

  @Get('/')
  async list(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._credentialService.listByOrg(org.id, profile?.id);
  }

  @Get('/:provider')
  async getByProvider(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string
  ) {
    const result = await this._credentialService.getRedacted(org.id, provider, profile?.id);
    if (!result) {
      return { provider, data: {}, updatedAt: null };
    }
    return {
      provider,
      data: result.data,
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  @Post('/:provider')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async create(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string,
    @Body() body: Record<string, string>
  ) {
    await this._credentialService.save(org.id, provider, body, profile?.id);
    const result = await this._credentialService.getRedacted(org.id, provider, profile?.id);
    return {
      provider,
      data: result!.data,
      updatedAt: result!.updatedAt.toISOString(),
    };
  }

  @Patch('/:provider')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async update(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string,
    @Body() body: Record<string, string>
  ) {
    await this._credentialService.save(org.id, provider, body, profile?.id);
    const result = await this._credentialService.getRedacted(org.id, provider, profile?.id);
    return {
      provider,
      data: result!.data,
      updatedAt: result!.updatedAt.toISOString(),
    };
  }

  @Delete('/:provider')
  @HttpCode(204)
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async remove(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string
  ) {
    await this._credentialService.delete(org.id, provider, profile?.id);
  }

  @Post('/facebook/configure-instagram-webhook')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async configureInstagramWebhook(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    const rawBase = (
      process.env.WEBHOOK_BASE_URL ||
      process.env.FRONTEND_URL ||
      process.env.BACKEND_URL ||
      ''
    ).replace(/\/$/, '');
    if (!rawBase || rawBase.startsWith('http://localhost') || rawBase.startsWith('http://127.')) {
      return {
        ok: false,
        error:
          'A Meta exige callback URL publica com HTTPS. Em dev, rode "ngrok http 3000" e defina WEBHOOK_BASE_URL=https://xxx.ngrok.io no .env',
      };
    }
    // Em producao, o nginx roteia /api/* para o backend.
    // Se WEBHOOK_BASE_URL nao foi definido, assume que estamos atras do nginx
    // e prepend /api ao path do webhook.
    const needsApiPrefix = !process.env.WEBHOOK_BASE_URL;
    const callbackUrl = `${rawBase}${needsApiPrefix ? '/api' : ''}/public/ig-webhook`;
    return this._credentialService.configureInstagramWebhook(
      org.id,
      callbackUrl,
      profile?.id
    );
  }

  @Post('/:provider/test')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async test(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string
  ) {
    return this._credentialService.test(org.id, provider, profile?.id);
  }
}
