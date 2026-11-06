import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  Min,
  Max,
  MaxLength,
  Matches,
  IsDefined,
  IsIn,
  IsString,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';

export class Collaborators {
  @IsDefined()
  @IsString()
  label: string;
}
/** Search metadata only; preview links expire and must not be saved in settings. */
export interface InstagramAudioSearchResult {
  id: string;
  title: string;
  artist: string;
  image: string;
  duration: number;
  previewUrl: string;
  platformPreviewUrl: string;
}

export class InstagramAudio {
  @IsString()
  @Matches(/^\d{1,40}$/)
  id: string;
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;
  @IsOptional()
  @IsString()
  @MaxLength(300)
  artist?: string;
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  image?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  audio_volume?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  video_volume?: number;
}
export class InstagramDto {
  @IsIn(['post', 'story'])
  @IsDefined()
  post_type: 'post' | 'story';

  @IsOptional()
  @ValidateNested()
  @Type(() => InstagramAudio)
  audio?: InstagramAudio;

  @IsOptional()
  is_trial_reel?: boolean;

  @IsIn(['MANUAL', 'SS_PERFORMANCE'])
  @IsOptional()
  graduation_strategy?: 'MANUAL' | 'SS_PERFORMANCE';

  @Type(() => Collaborators)
  @ValidateNested({ each: true })
  @IsArray()
  @IsOptional()
  collaborators: Collaborators[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  cover?: MediaDto;
}
