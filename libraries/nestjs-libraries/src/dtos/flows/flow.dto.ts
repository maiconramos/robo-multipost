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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
  @ApiProperty({
    enum: FlowStatus,
    enumName: 'FlowStatus',
    description:
      'Novo status: ACTIVE (liga e dispara assinatura do webhook), PAUSED (pausa), ARCHIVED (arquiva), DRAFT.',
    example: 'PAUSED',
  })
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
  @ApiProperty({
    description: 'Nome da automação (apenas para identificação na interface).',
    maxLength: 200,
    example: 'Receita - link no DM',
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiProperty({
    description:
      'ID do canal do Instagram onde a automação roda. Obtido em GET /public/v1/integrations (precisa ser um canal Instagram).',
    maxLength: 64,
    example: 'cmnykixkn0001q46kd9mxe2sn',
  })
  @IsString()
  @MaxLength(64)
  integrationId: string;

  @ApiPropertyOptional({
    enum: ['comment_on_post', 'story_reply'],
    default: 'comment_on_post',
    description:
      'Gatilho: comentário em post (comment_on_post) ou resposta a uma story (story_reply).',
  })
  @IsOptional()
  @IsIn(['comment_on_post', 'story_reply'])
  triggerType?: 'comment_on_post' | 'story_reply';

  @ApiPropertyOptional({
    enum: ['all', 'specific', 'next_publication'],
    default: 'next_publication',
    description:
      'Vínculo ao post: all (qualquer post do canal) · specific (apenas os ids em postIds/storyIds) · ' +
      'next_publication (vincula automaticamente ao PRÓXIMO post publicado — ideal para encadear).',
  })
  @IsOptional()
  @IsIn(['all', 'specific', 'next_publication'])
  postMode?: 'all' | 'specific' | 'next_publication';

  // Obrigatorio e nao-vazio quando postMode='specific' em comentario de post.
  // Em story_reply o alvo vem de storyIds, entao postIds fica opcional.
  @ApiPropertyOptional({
    type: [String],
    maxItems: 100,
    description:
      'IDs de mídia do Instagram. OBRIGATÓRIO (não-vazio) quando postMode=specific e triggerType=comment_on_post.',
    example: ['17999999999999999'],
  })
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
  @ApiPropertyOptional({
    type: [String],
    maxItems: 100,
    description:
      'IDs de story do Instagram. OBRIGATÓRIO (não-vazio) quando postMode=specific e triggerType=story_reply.',
  })
  @ValidateIf((o) => o.postMode === 'specific' && o.triggerType === 'story_reply')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  storyIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 50,
    description:
      'Palavras-chave a casar no comentário. VAZIO ou omitido = casa QUALQUER comentário. Cada keyword até 100 chars.',
    example: ['EU QUERO', 'QUERO'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  keywords?: string[];

  // any = pelo menos uma keyword casa | all = todas casam | exact = comentario
  // inteiro igual a keyword. Valores honrados em flow.activity.ts (orquestrador).
  @ApiPropertyOptional({
    enum: ['any', 'all', 'exact'],
    default: 'any',
    description:
      'Como casar as keywords: any (ao menos uma) · all (todas) · exact (comentário inteiro igual a uma keyword).',
  })
  @IsOptional()
  @IsIn(['any', 'all', 'exact'])
  matchMode?: string;

  @ApiPropertyOptional({
    description:
      'Apenas story_reply: também dispara em reações (emoji) à story, não só em respostas de texto. Padrão true.',
  })
  @IsOptional()
  @IsBoolean()
  matchReactions?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Liga o follow-gate: exige que o usuário siga o perfil antes de receber a DM com o link.',
  })
  @IsOptional()
  @IsBoolean()
  requireFollow?: boolean;

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Mensagem enviada quando o usuário ainda não segue (usado com requireFollow=true).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  followGateMessage?: string;

  @ApiPropertyOptional({
    maxLength: 2200,
    description: 'Resposta PÚBLICA ao comentário (apenas comment_on_post).',
    example: 'Te mandei no direct! 💬',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  replyMessage?: string;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description:
      'Variações de resposta pública (o sistema escolhe uma). Alternativa ao replyMessage; cada uma até 2200 chars.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(2200, { each: true })
  replyMessages?: string[];

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Texto da mensagem direta (DM) enviada ao autor do comentário.',
    example: 'Aqui está a receita completa 👇',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  dmMessage?: string;

  @ApiPropertyOptional({
    maxLength: 80,
    description: 'Texto do botão da DM (necessário quando há dmButtonUrl).',
    example: 'Ver receita',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  dmButtonText?: string;

  // URL do botao do DM. Endurecido: somente https publico (sem hosts privados
  // nem esquemas javascript:/data:/file:). O service revalida (chokepoint para
  // MCP e wizard); aqui e fail-fast no ValidationPipe da API REST/SDK.
  @ApiPropertyOptional({
    maxLength: 2048,
    description:
      'URL do botão da DM. Deve ser HTTPS PÚBLICA (bloqueia http, localhost, IPs privados e esquemas javascript:/data:/file:).',
    example: 'https://seu-blog.com/receita-de-bolo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsPublicHttpsUrl()
  dmButtonUrl?: string;

  // Fluxo de 2 etapas: DM inicial enviada com botao postback. So usado quando
  // requireFollow=true e triggerType=comment_on_post.
  @ApiPropertyOptional({
    maxLength: 2000,
    description:
      'Follow-gate em 2 etapas (requireFollow + comment_on_post): DM inicial com botão postback.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  openingDmMessage?: string;

  @ApiPropertyOptional({ maxLength: 80, description: 'Follow-gate 2 etapas: texto do botão da DM inicial.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  openingDmButtonText?: string;

  @ApiPropertyOptional({ maxLength: 80, description: 'Follow-gate 2 etapas: texto do botão "já sigo".' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  alreadyFollowedButtonText?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Follow-gate: mensagem quando esgotam as tentativas (maxGateAttempts).' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  gateExhaustedMessage?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 10,
    default: 3,
    description: 'Follow-gate: número máximo de tentativas (1 a 10).',
  })
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
