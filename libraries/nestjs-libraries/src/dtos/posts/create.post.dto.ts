import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Validate,
  ValidateIf,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';
import {
  allProviders,
  type AllProvidersSettings,
  EmptySettings,
} from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/all.providers.settings';
import { ValidContent } from '@gitroom/helpers/utils/valid.images';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';

export class Integration {
  @IsDefined()
  @IsString()
  id: string;
}

export class PostContent {
  @IsDefined()
  @IsString()
  @Validate(ValidContent)
  @Transform(({ value }) => sanitizePostContent(value))
  content: string;

  @IsOptional()
  @IsString()
  id: string;

  @IsOptional()
  @IsNumber()
  delay: number;

  @IsArray()
  @Type(() => MediaDto)
  @ValidateNested({ each: true })
  image: MediaDto[];
}

export class Post {
  type?: string;

  @IsDefined()
  @Type(() => Integration)
  @ValidateNested()
  integration: Integration;

  @IsDefined()
  @ArrayMinSize(1)
  @IsArray()
  @Type(() => PostContent)
  @ValidateNested({ each: true })
  value: PostContent[];

  @IsOptional()
  @IsString()
  group: string;

  // canal com data propria no editor do lote; os outros usam a data do post
  // (upstream a194e3f4). A API publica remove o campo.
  @IsOptional()
  @IsDateString()
  date?: string;

  @ValidateIf((o) => o.type !== 'draft')
  @ValidateNested()
  @Type(() => EmptySettings, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: '__type',
      subTypes: allProviders(EmptySettings),
    },
  })
  settings: AllProvidersSettings;
}

class Tags {
  @IsDefined()
  @IsString()
  value: string;

  @IsDefined()
  @IsString()
  label: string;
}

export class CreatePostDto {
  @IsDefined()
  @IsIn(['draft', 'schedule', 'now', 'update'])
  type: 'draft' | 'schedule' | 'now' | 'update';

  @IsOptional()
  @IsString()
  order?: string;

  @IsDefined()
  @IsBoolean()
  shortLink: boolean;

  // repeticao em dias: inteiro positivo e limitado (o calendario expande as
  // repeticoes num loop e o worker agenda a proxima pelo mesmo valor)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650) // mesmo teto do post-management (intervalInDays)
  inter?: number;

  @IsOptional()
  @IsBoolean()
  republish?: boolean;

  @IsDefined()
  @IsDateString()
  date: string;

  @IsArray()
  @IsDefined()
  @ValidateNested({ each: true })
  tags: Tags[];

  @IsDefined()
  @Type(() => Post)
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  posts: Post[];
}
