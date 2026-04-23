import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { OrganizationBranding } from '@prisma/client';
import {
  BRANDING_ASSET_COLUMN,
  BrandingAssetType,
  UpdateBrandingDto,
} from '@gitroom/nestjs-libraries/dtos/branding/update-branding.dto';

@Injectable()
export class OrganizationBrandingRepository {
  constructor(
    private _branding: PrismaRepository<'organizationBranding'>
  ) {}

  getByOrgId(organizationId: string): Promise<OrganizationBranding | null> {
    return this._branding.model.organizationBranding.findUnique({
      where: { organizationId },
    });
  }

  async upsertFields(
    organizationId: string,
    data: UpdateBrandingDto
  ): Promise<OrganizationBranding> {
    return this._branding.model.organizationBranding.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: { ...data },
    });
  }

  async setAssetPath(
    organizationId: string,
    assetType: BrandingAssetType,
    path: string | null
  ): Promise<OrganizationBranding> {
    const column = BRANDING_ASSET_COLUMN[assetType];
    return this._branding.model.organizationBranding.upsert({
      where: { organizationId },
      create: { organizationId, [column]: path } as any,
      update: { [column]: path } as any,
    });
  }
}
