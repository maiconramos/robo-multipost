import { IsOptional, IsNumber, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetNotificationsDto {
  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Página (0-indexed).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 0;
}
