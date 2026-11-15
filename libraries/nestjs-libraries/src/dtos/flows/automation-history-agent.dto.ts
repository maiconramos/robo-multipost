import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AutomationHistoryQueryDto } from './automation-history.dto';
export class AutomationAgentHistoryQueryDto extends AutomationHistoryQueryDto {
  @ApiPropertyOptional({ type: Number, enum: [1, 2, 3], default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3])
  executionVersion?: number;
  @ApiPropertyOptional({
    type: String,
    maxLength: 80,
    description: 'Chave de perfil não pode escolher outro perfil.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  profileId?: string;
}
export class AutomationAgentExecutionQueryDto {
  @ApiPropertyOptional({ type: Number, enum: [1, 2, 3], default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3])
  executionVersion?: number;
  @ApiPropertyOptional({ type: String, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  profileId?: string;
}
