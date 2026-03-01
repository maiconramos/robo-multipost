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
import { Organization } from '@prisma/client';
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
  async list(@GetOrgFromRequest() org: Organization) {
    return this._credentialService.listByOrg(org.id);
  }

  @Get('/:provider')
  async getByProvider(
    @GetOrgFromRequest() org: Organization,
    @Param('provider') provider: string
  ) {
    const result = await this._credentialService.getRedacted(org.id, provider);
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
    @Param('provider') provider: string,
    @Body() body: Record<string, string>
  ) {
    await this._credentialService.save(org.id, provider, body);
    const result = await this._credentialService.getRedacted(org.id, provider);
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
    @Param('provider') provider: string,
    @Body() body: Record<string, string>
  ) {
    await this._credentialService.save(org.id, provider, body);
    const result = await this._credentialService.getRedacted(org.id, provider);
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
    @Param('provider') provider: string
  ) {
    await this._credentialService.delete(org.id, provider);
  }

  @Post('/:provider/test')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async test(
    @GetOrgFromRequest() org: Organization,
    @Param('provider') provider: string
  ) {
    return this._credentialService.test(org.id, provider);
  }
}
