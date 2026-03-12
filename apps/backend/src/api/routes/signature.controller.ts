import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { SignatureService } from '@gitroom/nestjs-libraries/database/prisma/signatures/signature.service';
import { SignatureDto } from '@gitroom/nestjs-libraries/dtos/signature/signature.dto';

@ApiTags('Signatures')
@Controller('/signatures')
export class SignatureController {
  constructor(private _signatureService: SignatureService) {}

  @Get('/')
  async getSignatures(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._signatureService.getSignaturesByOrgId(org.id, profile?.id);
  }

  @Get('/default')
  async getDefaultSignature(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return (await this._signatureService.getDefaultSignature(org.id, profile?.id)) || {};
  }

  @Post('/')
  async createSignature(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: SignatureDto
  ) {
    return this._signatureService.createOrUpdateSignature(org.id, body, undefined, profile?.id);
  }

  @Delete('/:id')
  async deleteSignature(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this._signatureService.deleteSignature(org.id, id, profile?.id);
  }

  @Put('/:id')
  async updateSignature(
    @Param('id') id: string,
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: SignatureDto
  ) {
    return this._signatureService.createOrUpdateSignature(org.id, body, id, profile?.id);
  }
}
