import { HttpException, Injectable } from '@nestjs/common';
import { OrganizationBrandingRepository } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization-branding.repository';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  BRANDING_ASSET_COLUMN,
  BRANDING_ASSET_TYPES,
  BrandingAssetType,
  UpdateBrandingDto,
} from '@gitroom/nestjs-libraries/dtos/branding/update-branding.dto';
import { OrganizationBranding } from '@prisma/client';
import {
  deriveAccentVariants,
  isValidHexColor,
} from '@gitroom/nestjs-libraries/utils/color.utils';

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export interface PublicBranding {
  brandName: string | null;
  accentColor: string | null;
  accentHover: string | null;
  accentContrast: string | null;
  aiAccentColor: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  logoTextLightUrl: string | null;
  logoTextDarkUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  loginBgUrl: string | null;
  loginHeroText: string | null;
  emailFromName: string | null;
}

@Injectable()
export class OrganizationBrandingService {
  constructor(
    private _repository: OrganizationBrandingRepository
  ) {}

  isValidAssetType(value: string): value is BrandingAssetType {
    return (BRANDING_ASSET_TYPES as readonly string[]).includes(value);
  }

  async getPublic(organizationId: string): Promise<PublicBranding | null> {
    const branding = await this._repository.getByOrgId(organizationId);
    if (!branding) {
      return null;
    }
    return this.toPublic(branding);
  }

  async getRaw(organizationId: string): Promise<OrganizationBranding | null> {
    return this._repository.getByOrgId(organizationId);
  }

  async update(
    organizationId: string,
    dto: UpdateBrandingDto
  ): Promise<PublicBranding> {
    if (dto.accentColor && !isValidHexColor(dto.accentColor)) {
      throw new HttpException('Invalid accentColor', 422);
    }
    if (dto.aiAccentColor && !isValidHexColor(dto.aiAccentColor)) {
      throw new HttpException('Invalid aiAccentColor', 422);
    }
    const normalized: UpdateBrandingDto = {
      brandName: this.nullIfEmpty(dto.brandName),
      accentColor: this.nullIfEmpty(dto.accentColor?.toLowerCase()),
      aiAccentColor: this.nullIfEmpty(dto.aiAccentColor?.toLowerCase()),
      loginHeroText: this.nullIfEmpty(dto.loginHeroText),
      emailFromName: this.nullIfEmpty(dto.emailFromName),
    };
    const saved = await this._repository.upsertFields(organizationId, normalized);
    return this.toPublic(saved);
  }

  async uploadAsset(
    organizationId: string,
    assetType: BrandingAssetType,
    file: Express.Multer.File
  ): Promise<PublicBranding> {
    if (!file?.buffer) {
      throw new HttpException('File is required', 400);
    }
    if (file.size > MAX_ASSET_BYTES) {
      throw new HttpException('File too large (max 5MB)', 413);
    }
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      throw new HttpException(`Unsupported mime type: ${file.mimetype}`, 415);
    }

    const storage = UploadFactory.createStorage();
    const uploaded = await storage.uploadFile(file);
    const path: string | undefined =
      typeof uploaded === 'string' ? uploaded : uploaded?.path;
    if (!path) {
      throw new HttpException('Upload failed', 500);
    }

    const previous = await this._repository.getByOrgId(organizationId);
    const saved = await this._repository.setAssetPath(organizationId, assetType, path);

    const oldPath = previous
      ? (previous as any)[BRANDING_ASSET_COLUMN[assetType]]
      : null;
    if (oldPath && oldPath !== path) {
      try {
        await storage.removeFile(oldPath);
      } catch {
        // best-effort cleanup
      }
    }

    return this.toPublic(saved);
  }

  async removeAsset(
    organizationId: string,
    assetType: BrandingAssetType
  ): Promise<PublicBranding> {
    const previous = await this._repository.getByOrgId(organizationId);
    const oldPath = previous
      ? (previous as any)[BRANDING_ASSET_COLUMN[assetType]]
      : null;

    const saved = await this._repository.setAssetPath(organizationId, assetType, null);

    if (oldPath) {
      try {
        const storage = UploadFactory.createStorage();
        await storage.removeFile(oldPath);
      } catch {
        // best-effort cleanup
      }
    }

    return this.toPublic(saved);
  }

  private toPublic(branding: OrganizationBranding): PublicBranding {
    const variants = branding.accentColor
      ? deriveAccentVariants(branding.accentColor)
      : null;
    return {
      brandName: branding.brandName,
      accentColor: branding.accentColor,
      accentHover: variants?.hover ?? null,
      accentContrast: variants?.contrast ?? null,
      aiAccentColor: branding.aiAccentColor,
      logoLightUrl: this.assetUrl(branding.logoLightPath),
      logoDarkUrl: this.assetUrl(branding.logoDarkPath),
      logoTextLightUrl: this.assetUrl(branding.logoTextLightPath),
      logoTextDarkUrl: this.assetUrl(branding.logoTextDarkPath),
      faviconUrl: this.assetUrl(branding.faviconPath),
      ogImageUrl: this.assetUrl(branding.ogImagePath),
      loginBgUrl: this.assetUrl(branding.loginBgPath),
      loginHeroText: branding.loginHeroText,
      emailFromName: branding.emailFromName,
    };
  }

  private assetUrl(path: string | null): string | null {
    // Both LocalStorage and CloudflareStorage return fully-qualified URLs
    // in the `path` field of `uploadFile`, so we can pass them through.
    return path || null;
  }

  private nullIfEmpty(value: string | null | undefined): string | null {
    if (value === undefined) return undefined as any;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}
