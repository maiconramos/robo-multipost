import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
  ValidateIf,
  IsNumber,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FlowStatus, FlowNodeType } from '@prisma/client';
import { IsPublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/validators/is-public-https-url.validator';

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
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(64)
  integrationId: string;

  @IsOptional()
  @IsIn(['comment_on_post', 'story_reply'])
  triggerType?: 'comment_on_post' | 'story_reply';

  @IsOptional()
  @IsIn(['all', 'specific', 'next_publication'])
  postMode?: 'all' | 'specific' | 'next_publication';

  // Obrigatorio e nao-vazio quando postMode='specific' em comentario de post.
  // Em story_reply o alvo vem de storyIds, entao postIds fica opcional.
  @ValidateIf(
    (o) =>
      o.postMode === 'specific' &&
      (o.triggerType ?? 'comment_on_post') === 'comment_on_post'
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  postIds?: string[];

  // Obrigatorio e nao-vazio quando postMode='specific' em story_reply.
  @ValidateIf((o) => o.postMode === 'specific' && o.triggerType === 'story_reply')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  storyIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords?: string[];

  // any = pelo menos uma keyword casa | all = todas casam | exact = comentario
  // inteiro igual a keyword. Valores honrados em flow.activity.ts (orquestrador).
  @IsOptional()
  @IsIn(['any', 'all', 'exact'])
  matchMode?: string;

  @IsOptional()
  @IsBoolean()
  matchReactions?: boolean;

  @IsOptional()
  @IsBoolean()
  requireFollow?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followGateMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2200)
  replyMessage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2200, { each: true })
  replyMessages?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  dmMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  dmButtonText?: string;

  // URL do botao do DM. Endurecido: somente https publico (sem hosts privados
  // nem esquemas javascript:/data:/file:). O service revalida (chokepoint para
  // MCP e wizard); aqui e fail-fast no ValidationPipe da API REST/SDK.
  @IsOptional()
  @IsString()
  @IsPublicHttpsUrl()
  dmButtonUrl?: string;

  // Fluxo de 2 etapas: DM inicial enviada com botao postback. So usado quando
  // requireFollow=true e triggerType=comment_on_post.
  @IsOptional()
  @IsString()
  openingDmMessage?: string;

  @IsOptional()
  @IsString()
  openingDmButtonText?: string;

  @IsOptional()
  @IsString()
  alreadyFollowedButtonText?: string;

  @IsOptional()
  @IsString()
  gateExhaustedMessage?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxGateAttempts?: number;
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
