import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiOkResponse,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetPublicApiProfileId } from '@gitroom/nestjs-libraries/user/public.api.profile.from.request';
import {
  AutomationAgentHistoryQueryDto,
  AutomationAgentExecutionQueryDto,
} from '@gitroom/nestjs-libraries/dtos/flows/automation-history-agent.dto';
import {
  AutomationExecutionPage,
  AutomationExecutionDetail,
} from '@gitroom/nestjs-libraries/dtos/flows/automation-history.dto';
import { AutomationManagementService } from '@gitroom/nestjs-libraries/integrations/automations/automation-management.service';
import {
  AutomationCanvasDto,
  AutomationConfigurationDto,
  AutomationStatusDto,
  AutomationUpdateDto,
} from '@gitroom/nestjs-libraries/dtos/flows/automation-management.dto';

@ApiTags('Automações para agentes — Instagram, Facebook, Messenger e Repost')
@ApiSecurity('api-key')
@Controller('/public/v1/automations')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  })
)
export class PublicAutomationsController {
  constructor(private readonly service: AutomationManagementService) {}
  private scope(org: Organization, key?: string, requested?: string) {
    if (key && requested && key !== requested)
      throw new HttpException('PROFILE_KEY_MISMATCH', 403);
    return this.service.scope(org.id, key || requested);
  }
  private version(value?: string) {
    if (value !== undefined && !['1', '2', '3'].includes(value))
      throw new HttpException('INVALID_EXECUTION_VERSION', 400);
    return value ? Number(value) : 1;
  }
  @Get('/capabilities')
  @ApiOperation({
    summary:
      'Matriz completa de campos, gatilhos, limites, grafos e capacidades reais',
  })
  async capabilities(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile?: string
  ) {
    await this.scope(org, key, profile);
    return this.service.capabilities();
  }
  @Get('/options')
  @ApiOperation({
    summary:
      'Descobrir canais, posts, Stories, agendados, resolver publicação Facebook ou consultar prontidão',
  })
  @ApiQuery({
    name: 'resource',
    enum: [
      'channels',
      'posts',
      'stories',
      'scheduled_posts',
      'resolve_post',
      'readiness',
    ],
  })
  @ApiQuery({ name: 'integrationId', required: false })
  @ApiQuery({
    name: 'platform',
    required: false,
    enum: ['instagram', 'facebook'],
  })
  @ApiQuery({
    name: 'triggerType',
    required: false,
    enum: ['comment_on_post', 'story_reply', 'messenger_message'],
  })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'selectedId', required: false })
  @ApiQuery({ name: 'reference', required: false })
  async options(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query() query: Record<string, string>
  ) {
    const { profileId, ...options } = query;
    return this.service.options(await this.scope(org, key, profileId), options);
  }
  @Post('/repost')
  @ApiOperation({
    summary: 'Gerenciar o recurso separado de repost',
    description:
      'Contrato completo e exemplos em docs/api/automations-agent-api.md. Consultas não executam conteúdo. run_now e reset_checkpoint são ações explícitas.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: {
        operation: {
          type: 'string',
          enum: [
            'sources',
            'destinations',
            'list',
            'get',
            'create',
            'update',
            'toggle',
            'archive',
            'history',
            'run_now',
            'reset_checkpoint',
          ],
        },
        ruleId: { type: 'string' },
        sourceType: {
          type: 'string',
          enum: ['INSTAGRAM_STORY', 'INSTAGRAM_POST'],
        },
        enabled: { type: 'boolean' },
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        configuration: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 120 },
            sourceIntegrationId: { type: 'string' },
            sourceType: {
              type: 'string',
              enum: ['INSTAGRAM_STORY', 'INSTAGRAM_POST'],
            },
            destinations: {
              type: 'array',
              items: {
                type: 'object',
                required: ['integrationId', 'format'],
                additionalProperties: false,
                properties: {
                  integrationId: { type: 'string' },
                  format: {
                    type: 'string',
                    enum: [
                      'INSTAGRAM_POST',
                      'INSTAGRAM_STORY',
                      'FACEBOOK_REEL',
                      'FACEBOOK_STORY',
                      'TIKTOK_FEED',
                      'YOUTUBE_SHORT',
                      'LINKEDIN_POST',
                      'X_POST',
                      'THREADS_POST',
                      'PINTEREST_PIN',
                    ],
                  },
                },
              },
            },
            intervalMinutes: { type: 'integer', minimum: 5, maximum: 360 },
            filterIncludeVideos: { type: 'boolean' },
            filterIncludeImages: { type: 'boolean' },
            filterMaxDurationSeconds: {
              type: 'integer',
              minimum: 1,
              maximum: 900,
              nullable: true,
            },
            filterHashtag: { type: 'string', nullable: true },
            captionTemplate: { type: 'string', nullable: true },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
  })
  @Throttle({ default: { limit: 60, ttl: 3600_000 } })
  async repost(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Body() body: Record<string, unknown>
  ) {
    return this.service.repost(await this.scope(org, key, profile), body);
  }
  @Get()
  @ApiOperation({
    summary:
      'Listar todos os motores do perfil, com executionVersion explícita',
  })
  async list(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile?: string,
    @Query('executionVersion') version?: string,
    @Query('integrationId') integrationId?: string
  ) {
    return this.service.list(
      await this.scope(org, key, profile),
      version ? this.version(version) : undefined,
      integrationId
    );
  }
  @Post()
  @ApiOperation({
    summary: 'Criar automação com todos os recursos declarativos do gatilho',
    description:
      'activate=false mantém rascunho. Falha após criação retorna o mesmo ID e saved=true para retomada. Consulte capabilities antes de escolher campos.',
  })
  @ApiBody({ type: AutomationConfigurationDto })
  @Throttle({ default: { limit: 20, ttl: 3600_000 } })
  async create(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Body() body: AutomationConfigurationDto
  ) {
    return this.service.create(await this.scope(org, key, profile), body);
  }
  @Get('/:id')
  @ApiOperation({
    summary:
      'Detalhar configuração recuperável, grafo, aliases e controle de versão',
  })
  @ApiQuery({
    name: 'executionVersion',
    required: false,
    enum: ['1', '2', '3'],
    description:
      '1=Instagram direto; 2=Facebook/Messenger; 3=Instagram via Zernio. Não há fallback entre motores.',
  })
  async detail(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Query('executionVersion') version?: string
  ) {
    return this.service.detail(
      await this.scope(org, key, profile),
      id,
      this.version(version)
    );
  }
  @Put('/:id')
  @ApiOperation({
    summary:
      'Editar campos parcialmente, preservando os omitidos e recusando grafo personalizado',
    description:
      'V1 exige expectedUpdatedAt retornado no detalhe. V2/V3 exigem expectedRevision. Não altera rede, conta, gatilho ou status.',
  })
  @ApiBody({ type: AutomationUpdateDto })
  @Throttle({ default: { limit: 20, ttl: 3600_000 } })
  async update(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Body() body: AutomationUpdateDto,
    @Query('executionVersion') version?: string
  ) {
    return this.service.update(
      await this.scope(org, key, profile),
      id,
      this.version(version),
      body
    );
  }
  @Put('/:id/canvas')
  @ApiBody({ type: AutomationCanvasDto })
  @ApiOperation({
    summary:
      'Salvar grafo completo explicitamente, com validação por tipo de nó e concorrência',
  })
  async canvas(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Body() body: AutomationCanvasDto,
    @Query('executionVersion') version?: string
  ) {
    return this.service.canvas(
      await this.scope(org, key, profile),
      id,
      this.version(version),
      body
    );
  }
  @Post('/:id/status')
  @ApiBody({ type: AutomationStatusDto })
  @ApiOperation({
    summary:
      'Ativar, pausar ou arquivar sem recriar. V2 exige expectedRevision e não aceita DRAFT.',
  })
  @Throttle({ default: { limit: 20, ttl: 3600_000 } })
  async status(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Body() body: AutomationStatusDto,
    @Query('executionVersion') version?: string
  ) {
    return this.service.status(
      await this.scope(org, key, profile),
      id,
      this.version(version),
      body.status,
      body.expectedRevision
    );
  }
  @Get('/:id/history')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Histórico padronizado com filtros e cursor, sem executar ou reenviar',
  })
  @ApiOkResponse({ type: AutomationExecutionPage })
  async executionHistory(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Param('id') id: string,
    @Query() query: AutomationAgentHistoryQueryDto
  ) {
    const { profileId, executionVersion = 1, ...filters } = query;
    return this.service.executionHistory(
      await this.scope(org, key, profileId),
      id,
      executionVersion,
      filters
    );
  }
  @Get('/:id/history/:executionId')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Detalhes de uma execução com etapas reais e informações técnicas permitidas',
  })
  @ApiOkResponse({ type: AutomationExecutionDetail })
  async executionDetail(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Param('id') id: string,
    @Param('executionId') executionId: string,
    @Query() query: AutomationAgentExecutionQueryDto
  ) {
    return this.service.executionDetail(
      await this.scope(org, key, query.profileId),
      id,
      query.executionVersion ?? 1,
      executionId
    );
  }
  @Get('/:id/executions')
  @ApiOperation({
    summary: 'Consultar histórico no perfil autenticado sem reexecutar',
  })
  async history(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Query('executionVersion') version?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.service.history(
      await this.scope(org, key, profile),
      id,
      this.version(version),
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );
  }
  @Post('/:id/aliases')
  @ApiOperation({
    summary:
      'Listar, adicionar ou remover aliases de Dark Posts Instagram no próprio perfil',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: {
        operation: { type: 'string', enum: ['list', 'add', 'remove'] },
        aliasMediaId: { type: 'string', pattern: '^\\d{1,30}$' },
        aliasId: { type: 'string' },
      },
    },
  })
  async aliases(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>
  ) {
    return this.service.aliases(await this.scope(org, key, profile), id, body);
  }
}
