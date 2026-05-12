import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnmatchedStatus } from '@prisma/client';

// Meta media IDs sao numericos (ate ~25 digitos). Restringir o formato evita
// que caracteres como '?', '/' ou '#' alterem a URL do Graph API quando
// interpolados no path em getMediaMetadata.
const META_MEDIA_ID_REGEX = /^\d{1,30}$/;

export class CreateAliasDto {
  @IsString()
  flowId: string;

  @IsString()
  @Matches(META_MEDIA_ID_REGEX, {
    message: 'aliasMediaId deve conter apenas digitos (1-30 caracteres)',
  })
  aliasMediaId: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BindFromInboxDto {
  @IsString()
  unmatchedCommentId: string;

  @IsString()
  flowId: string;
}

export class IgnoreUnmatchedDto {
  @IsString()
  unmatchedCommentId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListUnmatchedQueryDto {
  @IsString()
  integrationId: string;

  @IsOptional()
  @IsEnum(UnmatchedStatus)
  status?: UnmatchedStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class LookupAliasQueryDto {
  @IsString()
  integrationId: string;

  @IsString()
  @Matches(META_MEDIA_ID_REGEX, {
    message: 'aliasMediaId deve conter apenas digitos (1-30 caracteres)',
  })
  aliasMediaId: string;
}
