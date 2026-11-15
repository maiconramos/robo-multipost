import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
export type HistoryEngine = 'instagram' | 'shared' | 'zernio';
export const historyStatuses = [
  'completed',
  'waiting',
  'failed',
  'running',
  'skipped',
  'unknown',
] as const;
export type HistoryStatus = (typeof historyStatuses)[number];
export const automationHistoryQuerySchema = z
  .object({
    status: z.enum(['all', ...historyStatuses]).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    cursor: z.string().max(512).optional(),
  })
  .strict();
export class AutomationHistoryQueryDto {
  @ApiPropertyOptional({ enum: ['all', ...historyStatuses] })
  @IsOptional()
  @IsIn(['all', ...historyStatuses])
  status?: 'all' | HistoryStatus;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  from?: string;
  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;
  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
  @ApiPropertyOptional({ type: String, maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
export class AutomationExecutionSummary {
  @ApiProperty() id: string;
  @ApiProperty({ enum: historyStatuses }) status: HistoryStatus;
  @ApiProperty({ enum: ['instagram', 'facebook', 'messenger'] }) channel:
    | 'instagram'
    | 'facebook'
    | 'messenger';
  @ApiProperty({
    enum: ['comment_on_post', 'story_reply', 'messenger_message', 'unknown'],
  })
  trigger: 'comment_on_post' | 'story_reply' | 'messenger_message' | 'unknown';
  @ApiProperty({ type: String, nullable: true }) actorName: string | null;
  @ApiProperty({ type: String, nullable: true }) actorId: string | null;
  @ApiProperty({ type: String, nullable: true }) text: string | null;
  @ApiProperty() textTruncated: boolean;
  @ApiProperty({ type: String, nullable: true }) accountName: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: [
      'waiting_interaction',
      'outcome_unknown',
      'failed',
      'cancelled',
      'higher_priority',
      'condition',
    ],
  })
  guidance:
    | 'waiting_interaction'
    | 'outcome_unknown'
    | 'failed'
    | 'cancelled'
    | 'higher_priority'
    | 'condition'
    | null;
}
export class AutomationExecutionStep {
  @ApiProperty() id: string;
  @ApiProperty({
    enum: [
      'TRIGGER',
      'CONDITION',
      'REPLY_COMMENT',
      'SEND_DM',
      'DELAY',
      'GATE_RESOLVE',
      'UNKNOWN',
    ],
  })
  kind:
    | 'TRIGGER'
    | 'CONDITION'
    | 'REPLY_COMMENT'
    | 'SEND_DM'
    | 'DELAY'
    | 'GATE_RESOLVE'
    | 'UNKNOWN';
  @ApiProperty({
    enum: [
      'started',
      'completed',
      'accepted',
      'waiting',
      'failed',
      'skipped',
      'unknown',
      'unclassified',
    ],
  })
  status:
    | 'started'
    | 'completed'
    | 'accepted'
    | 'waiting'
    | 'failed'
    | 'skipped'
    | 'unknown'
    | 'unclassified';
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) at:
    | string
    | null;
  @ApiProperty({ type: String, nullable: true }) message: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    enum: [
      'TOKEN_INVALID',
      'APP_MISMATCH',
      'PERMISSION_DENIED',
      'RATE_LIMITED',
      'META_REJECTED',
      'OUTCOME_UNKNOWN',
      'INVALID_INPUT',
      'KEYWORDS_NOT_MATCHED',
      'GATE_EXHAUSTED',
      'FOLLOW_REQUIRED',
      'FOLLOW_CONFIRMED',
    ],
  })
  issue?:
    | 'TOKEN_INVALID'
    | 'APP_MISMATCH'
    | 'PERMISSION_DENIED'
    | 'RATE_LIMITED'
    | 'META_REJECTED'
    | 'OUTCOME_UNKNOWN'
    | 'INVALID_INPUT'
    | 'KEYWORDS_NOT_MATCHED'
    | 'GATE_EXHAUSTED'
    | 'FOLLOW_REQUIRED'
    | 'FOLLOW_CONFIRMED'
    | null;
}
export class AutomationExecutionTechnical {
  @ApiProperty() flowId: string;
  @ApiProperty({ enum: ['instagram', 'shared', 'zernio'] })
  engine: HistoryEngine;
  @ApiProperty({ type: String, nullable: true }) integrationId: string | null;
  @ApiProperty({ type: Number, nullable: true }) revision: number | null;
  @ApiProperty({ type: String, nullable: true }) postId: string | null;
}
export class AutomationExecutionDetail extends AutomationExecutionSummary {
  @ApiProperty({ type: () => [AutomationExecutionStep] })
  steps: AutomationExecutionStep[];
  @ApiProperty() logTruncated: boolean;
  @ApiProperty({ type: () => AutomationExecutionTechnical })
  technical: AutomationExecutionTechnical;
}
export class AutomationExecutionPage {
  @ApiProperty({ type: () => [AutomationExecutionSummary] })
  items: AutomationExecutionSummary[];
  @ApiProperty({ type: String, nullable: true }) nextCursor: string | null;
}
