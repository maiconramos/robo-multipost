import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateAiCreditsDto {
  @IsOptional()
  @IsInt()
  @Min(-1)
  aiImageCredits?: number | null;

  @IsOptional()
  @IsInt()
  @Min(-1)
  aiVideoCredits?: number | null;
}
