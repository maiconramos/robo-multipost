import {
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';
import { Type } from 'class-transformer';

export class WordpressDto {
  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  main_image?: MediaDto;

  @IsString()
  @IsDefined()
  type: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  categories?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tags?: number[];

  @IsOptional()
  @IsString()
  @IsIn(['publish', 'draft', 'pending', 'private'])
  status?: string;
}
