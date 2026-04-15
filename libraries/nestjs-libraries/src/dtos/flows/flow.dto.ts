import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FlowStatus, FlowNodeType } from '@prisma/client';

export class CreateFlowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  integrationId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerPostIds?: string[];
}

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerPostIds?: string[];
}

export class UpdateFlowStatusDto {
  @IsEnum(FlowStatus)
  status: FlowStatus;
}

export class FlowNodeDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsEnum(FlowNodeType)
  type: FlowNodeType;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  data?: string;

  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;
}

export class FlowEdgeDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  sourceNodeId: string;

  @IsString()
  targetNodeId: string;

  @IsOptional()
  @IsString()
  sourceHandle?: string;
}

export class QuickCreateFlowDto {
  @IsString()
  name: string;

  @IsString()
  integrationId: string;

  @IsOptional()
  @IsIn(['comment_on_post', 'story_reply'])
  triggerType?: 'comment_on_post' | 'story_reply';

  @IsOptional()
  @IsIn(['all', 'specific', 'next_publication'])
  postMode?: 'all' | 'specific' | 'next_publication';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  postIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storyIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsString()
  matchMode?: string;

  @IsOptional()
  @IsBoolean()
  matchReactions?: boolean;

  @IsOptional()
  @IsBoolean()
  requireFollow?: boolean;

  @IsOptional()
  @IsString()
  followGateMessage?: string;

  @IsOptional()
  @IsString()
  replyMessage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  replyMessages?: string[];

  @IsOptional()
  @IsString()
  dmMessage?: string;

  @IsOptional()
  @IsString()
  dmButtonText?: string;

  @IsOptional()
  @IsString()
  dmButtonUrl?: string;
}

export class SaveCanvasDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowNodeDto)
  nodes: FlowNodeDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowEdgeDto)
  edges: FlowEdgeDto[];
}
