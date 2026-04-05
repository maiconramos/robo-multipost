import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateProfilePersonaDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brandDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  toneOfVoice?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  writingInstructions?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  preferredCtas?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contentRestrictions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageStyle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  targetAudience?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(5000, { each: true })
  examplePosts?: string[];
}
