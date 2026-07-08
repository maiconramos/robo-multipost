import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { StatusEventType } from '@gitroom/nestjs-libraries/dtos/status/status.dto';

/**
 * Query da paginação/filtro do GET /status/history. Valida input externo
 * (admin-only, mas ainda assim vindo da URL). `cursor` é o id do último item da
 * página anterior; `type`/`severity` restringem o log; `limit` é limitado a 100.
 */
export class StatusHistoryQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(['CHANNEL_DISCONNECT', 'POST_FAILED', 'AUTOMATION_FAILED'])
  type?: StatusEventType;

  @IsOptional()
  @IsIn(['critical', 'warning'])
  severity?: 'critical' | 'warning';

  @IsOptional()
  @IsString()
  profileId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
