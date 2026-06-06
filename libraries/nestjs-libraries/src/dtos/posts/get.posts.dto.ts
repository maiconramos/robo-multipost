import {
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetPostsDto {
  @ApiProperty({ description: 'Data inicial do filtro (ISO 8601).', example: '2026-05-01T00:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Data final do filtro (ISO 8601).', example: '2026-06-05T23:59:59Z' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Filtra por cliente (customer).' })
  @IsOptional()
  @IsString()
  customer: string;
}
