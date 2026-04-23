import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { OrganizationBrandingService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization-branding.service';
import { UpdateBrandingDto } from '@gitroom/nestjs-libraries/dtos/branding/update-branding.dto';

@ApiTags('Branding')
@Controller('/branding')
export class BrandingController {
  constructor(private _brandingService: OrganizationBrandingService) {}

  @Get('/')
  async getBranding(@GetOrgFromRequest() org: Organization) {
    const branding = await this._brandingService.getPublic(org.id);
    return { branding };
  }

  @Put('/')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async updateBranding(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UpdateBrandingDto
  ) {
    const branding = await this._brandingService.update(org.id, body);
    return { branding };
  }

  @Post('/asset/:assetType')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @UseInterceptors(FileInterceptor('file'))
  async uploadAsset(
    @GetOrgFromRequest() org: Organization,
    @Param('assetType') assetType: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    if (!this._brandingService.isValidAssetType(assetType)) {
      throw new HttpException(`Invalid asset type: ${assetType}`, 400);
    }
    const branding = await this._brandingService.uploadAsset(
      org.id,
      assetType,
      file
    );
    return { branding };
  }

  @Delete('/asset/:assetType')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async removeAsset(
    @GetOrgFromRequest() org: Organization,
    @Param('assetType') assetType: string
  ) {
    if (!this._brandingService.isValidAssetType(assetType)) {
      throw new HttpException(`Invalid asset type: ${assetType}`, 400);
    }
    const branding = await this._brandingService.removeAsset(org.id, assetType);
    return { branding };
  }
}
