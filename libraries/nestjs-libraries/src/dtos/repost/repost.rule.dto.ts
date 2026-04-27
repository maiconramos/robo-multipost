import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RepostDestinationFormat, RepostSourceType } from '@prisma/client';

export class RepostDestinationDto {
  @IsString()
  @IsDefined()
  integrationId: string;

  @IsEnum(RepostDestinationFormat)
  format: RepostDestinationFormat;
}

export class CreateRepostRuleDto {
  @IsString()
  @IsDefined()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsDefined()
  sourceIntegrationId: string;

  @IsEnum(RepostSourceType)
  @IsDefined()
  sourceType: RepostSourceType;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RepostDestinationDto)
  destinations: RepostDestinationDto[];

  @IsInt()
  @Min(5)
  @Max(360)
  @IsOptional()
  intervalMinutes?: number;

  @IsBoolean()
  @IsOptional()
  filterIncludeVideos?: boolean;

  @IsBoolean()
  @IsOptional()
  filterIncludeImages?: boolean;

  @IsInt()
  @Min(1)
  @Max(900)
  @IsOptional()
  filterMaxDurationSeconds?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  filterHashtag?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(2200)
  captionTemplate?: string | null;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateRepostRuleDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsString()
  @IsOptional()
  sourceIntegrationId?: string;

  @IsEnum(RepostSourceType)
  @IsOptional()
  sourceType?: RepostSourceType;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RepostDestinationDto)
  @IsOptional()
  destinations?: RepostDestinationDto[];

  @IsInt()
  @Min(5)
  @Max(360)
  @IsOptional()
  intervalMinutes?: number;

  @IsBoolean()
  @IsOptional()
  filterIncludeVideos?: boolean;

  @IsBoolean()
  @IsOptional()
  filterIncludeImages?: boolean;

  @IsInt()
  @Min(1)
  @Max(900)
  @IsOptional()
  filterMaxDurationSeconds?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  filterHashtag?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(2200)
  captionTemplate?: string | null;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class ToggleRepostRuleDto {
  @IsBoolean()
  @IsDefined()
  enabled: boolean;
}
