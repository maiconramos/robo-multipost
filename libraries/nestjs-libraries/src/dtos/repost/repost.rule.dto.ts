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
} from 'class-validator';
import { RepostSourceType } from '@prisma/client';

export class CreateRepostRuleDto {
  @IsString()
  @IsDefined()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsDefined()
  sourceIntegrationId: string;

  @IsEnum(RepostSourceType)
  @IsOptional()
  sourceType?: RepostSourceType;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  destinationIntegrationIds: string[];

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

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  destinationIntegrationIds?: string[];

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
