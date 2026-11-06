import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import {
  ApiTags,
  ApiSecurity,
  ApiOperation,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiConsumes,
} from '@nestjs/swagger';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetPublicApiProfileId } from '@gitroom/nestjs-libraries/user/public.api.profile.from.request';
import { GetOAuthUserIdFromRequest } from '@gitroom/nestjs-libraries/user/oauth.user.id.from.request';
import { UsersService } from '@gitroom/nestjs-libraries/database/prisma/users/users.service';
import { Organization } from '@prisma/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaTransferService } from '@gitroom/nestjs-libraries/upload/media-transfer.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { UpdateReleaseIdDto } from '@gitroom/nestjs-libraries/dtos/posts/update.release.id.dto';
import { TriggerToolDto } from '@gitroom/nestjs-libraries/dtos/integrations/trigger.tool.dto';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { UploadDto } from '@gitroom/nestjs-libraries/dtos/media/upload.dto';
import { GetMediaDto } from '@gitroom/nestjs-libraries/dtos/media/get.media.dto';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { GetNotificationsDto } from '@gitroom/nestjs-libraries/dtos/notifications/get.notifications.dto';
import { CustomFileValidationPipe } from '@gitroom/nestjs-libraries/upload/custom.upload.validation';
import * as Sentry from '@sentry/nestjs';
import {
  socialIntegrationList,
  IntegrationManager,
} from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { decryptIntegrationToken } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';

// Exemplos prontos exibidos no Swagger para POST /public/v1/posts. O body e
// processado como `any` (mapeado para CreatePostDto), entao fornecemos exemplos
// completos e copiaveis para quem usa a API/n8n.
const POST_BODY_EXAMPLES: Record<string, { summary: string; value: any }> = {
  'publicar-agora': {
    summary: 'Publicar agora (type=now) com imagem',
    value: {
      type: 'now',
      date: '2026-06-10T14:30:00Z',
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: 'SEU_INTEGRATION_ID' },
          value: [
            {
              content: 'Meu post de teste 🚀',
              image: [
                { id: 'media-1', path: 'https://seu-cdn.com/imagem.jpg' },
              ],
            },
          ],
          settings: { __type: 'instagram' },
        },
      ],
    },
  },
  'agendar-data': {
    summary: 'Agendar para uma data futura (type=schedule)',
    value: {
      type: 'schedule',
      date: '2026-06-15T09:00:00Z',
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: 'SEU_INTEGRATION_ID' },
          value: [{ content: 'Post agendado 📅', image: [] }],
          settings: { __type: 'instagram' },
        },
      ],
    },
  },
  rascunho: {
    summary: 'Salvar como rascunho (type=draft)',
    value: {
      type: 'draft',
      date: '2026-06-15T09:00:00Z',
      shortLink: false,
      tags: [],
      posts: [
        {
          integration: { id: 'SEU_INTEGRATION_ID' },
          value: [{ content: 'Rascunho de post ✍️', image: [] }],
        },
      ],
    },
  },
};

@ApiTags('Public API')
@ApiSecurity('api-key')
@Controller('/public/v1')
export class PublicIntegrationsController {
  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _encryption: EncryptionService,
    private _usersService: UsersService,
    private readonly _mediaTransfer: MediaTransferService
  ) {}

  @Post('/upload')
  @ApiOperation({
    summary: 'Upload de um arquivo de mídia (multipart)',
    description:
      'Envie o arquivo no campo `file` (multipart/form-data). Retorna o objeto de mídia salvo (com `id` e `path`) para usar em `image[].path` ao criar um post.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Arquivo salvo (retorna id + path).',
  })
  @ApiResponse({ status: 400, description: 'Nenhum arquivo enviado.' })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new CustomFileValidationPipe())
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @UploadedFile('file') file: Express.Multer.File
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaTransfer.fromFile(org.id, publicApiProfileId, file);
  }

  @Post('/upload-from-url')
  @ApiOperation({
    summary: 'Upload de mídia a partir de uma URL',
    description:
      'Baixa por streaming a mídia HTTPS pública, incluindo link individual compartilhado do Google Drive com download permitido (sem login). Imagens até 10 MiB e MP4 até 1 GiB; download até 5 minutos, sujeito ao prazo do proxy/cliente. Não aceita pastas ou documentos Google. Salva no escopo autenticado e retorna o objeto de mídia (com `id` e `path`) para usar em `image[].path` ao criar um post.',
  })
  @ApiResponse({
    status: 201,
    description: 'Mídia da URL salva (retorna id + path).',
  })
  @ApiResponse({ status: 400, description: 'URL inválida ou inacessível.' })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  async uploadsFromUrl(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Body() body: UploadDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaTransfer.fromUrl(org.id, publicApiProfileId, body.url);
  }

  @Get('/find-slot/:id')
  @ApiOperation({
    summary: 'Próximo horário livre para agendar',
    description:
      'Retorna `{ date }` com o próximo horário disponível para agendar um post no canal.',
  })
  @ApiParam({
    name: 'id',
    required: false,
    description: 'integrationId (opcional)',
  })
  @ApiResponse({ status: 200, description: 'Horário livre encontrado.' })
  async findSlotIntegration(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (id && publicApiProfileId) {
      await this._integrationService.validateIntegrationProfile(
        org.id,
        id,
        publicApiProfileId
      );
    }
    return {
      date: await this._postsService.findFreeDateTime(
        org.id,
        id,
        publicApiProfileId
      ),
    };
  }

  @Get('/posts')
  @ApiOperation({
    summary: 'Listar posts',
    description:
      'Lista os posts da organização no intervalo `startDate`–`endDate`.',
  })
  @ApiResponse({ status: 200, description: 'Lista de posts.' })
  @ApiResponse({ status: 400, description: 'Parâmetros de query inválidos.' })
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Query() query: GetPostsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (
      publicApiProfileId &&
      query.profileId &&
      query.profileId !== publicApiProfileId
    ) {
      throw new HttpException(
        { msg: 'Profile key cannot access another profile' },
        403
      );
    }
    const effectiveProfileId = publicApiProfileId ?? query.profileId;
    const posts = await this._postsService.getPosts(
      org.id,
      query,
      effectiveProfileId
    );
    return {
      posts,
      // comments,
    };
  }

  @Post('/posts')
  @ApiOperation({
    summary: 'Criar / agendar um post',
    description:
      'Cria um post (publicar agora, agendar ou rascunho). Cada item de `posts` mira um canal (`integration.id`, de GET /public/v1/integrations) com `value[].content` (texto) e `value[].image[]` (mídias de GET /public/v1/upload). `settings.__type` deve ser o identificador do provider (ex.: "instagram", "x", "facebook").',
  })
  @ApiBody({
    schema: { type: 'object', additionalProperties: true },
    examples: POST_BODY_EXAMPLES,
  })
  @ApiResponse({ status: 201, description: 'Post criado.' })
  @ApiResponse({ status: 400, description: 'Dados do post inválidos.' })
  @ApiResponse({
    status: 401,
    description: 'Chave de API ausente ou inválida.',
  })
  @ApiResponse({ status: 403, description: 'Limite mensal de posts atingido.' })
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createPost(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Body() rawBody: any
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const body = await this._postsService.mapTypeToPost(
      this._postsService.stripEditorOnlyFields(rawBody),
      org.id,
      rawBody.type === 'draft'
    );
    body.type = rawBody.type;

    // Chave de perfil so publica nos canais do proprio perfil.
    if (publicApiProfileId) {
      for (const post of body.posts || []) {
        if (post?.integration?.id) {
          await this._integrationService.validateIntegrationProfile(
            org.id,
            post.integration.id,
            publicApiProfileId
          );
        }
      }
    }

    return this._postsService.createPost(org.id, body, publicApiProfileId);
  }

  @Delete('/posts/:id')
  @ApiOperation({ summary: 'Excluir um post (e seu grupo)' })
  @ApiParam({ name: 'id', description: 'ID do post' })
  @ApiResponse({ status: 200, description: 'Post excluído.' })
  @ApiResponse({ status: 404, description: 'Post não encontrado.' })
  async deletePost(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const getPostById = await this._postsService.getPost(org.id, id);
    const postProfileId = getPostById?.posts?.[0]?.profileId;
    if (
      publicApiProfileId &&
      postProfileId &&
      postProfileId !== publicApiProfileId
    ) {
      throw new HttpException({ msg: 'Post not found' }, 404);
    }
    return this._postsService.deletePost(
      org.id,
      getPostById.group,
      publicApiProfileId
    );
  }

  @Delete('/posts/group/:group')
  @ApiOperation({ summary: 'Excluir todos os posts de um grupo' })
  @ApiParam({ name: 'group', description: 'ID do grupo de posts' })
  deletePostByGroup(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('group') group: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.deletePost(org.id, group, publicApiProfileId);
  }

  @Get('/me')
  @ApiOperation({
    summary: 'Quem está conectado',
    description:
      'Organização da chave, o perfil (chave de perfil) e o usuário que aprovou o app OAuth (token `pos_`). Chave de API não tem usuário.',
  })
  async getMe(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @GetOAuthUserIdFromRequest() userId?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const user = userId ? await this._usersService.getPersonal(userId) : null;

    // so campos de exibicao (upstream 852ac517)
    return {
      organization: { id: org.id, name: org.name },
      profile: publicApiProfileId ? { id: publicApiProfileId } : null,
      user: user
        ? { id: user.id, name: user.name, picture: user.picture?.path || null }
        : null,
    };
  }

  @Get('/is-connected')
  @ApiOperation({
    summary: 'Healthcheck da chave de API',
    description: 'Retorna `{ connected: true }` se a chave for válida.',
  })
  async getActiveIntegrations(@GetOrgFromRequest() org: Organization) {
    Sentry.metrics.count('public_api-request', 1);
    return { connected: true };
  }

  @Get('/integrations')
  @ApiOperation({
    summary: 'Listar canais (integrações)',
    description:
      'Lista os canais conectados (Instagram, X, Facebook, etc.). Use o `id` retornado como `integrationId` ao criar posts/automações.',
  })
  @ApiQuery({
    name: 'profileId',
    required: false,
    description:
      'Filtra por perfil (chave de org). Chave de perfil só vê o próprio.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de canais (id, name, identifier, picture, ...).',
  })
  @ApiResponse({
    status: 403,
    description: 'Chave de perfil tentando acessar outro perfil.',
  })
  async listIntegration(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Query('profileId') profileId?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (publicApiProfileId && profileId && profileId !== publicApiProfileId) {
      throw new HttpException(
        { msg: 'Profile key cannot access another profile' },
        403
      );
    }
    const effectiveProfileId = publicApiProfileId ?? profileId;
    return (
      await this._integrationService.getIntegrationsList(
        org.id,
        effectiveProfileId
      )
    ).map((org) => ({
      id: org.id,
      name: org.customName || org.name,
      identifier: org.providerIdentifier,
      picture: org.picture,
      disabled: org.disabled,
      profile: org.profile,
      customer: org.customer
        ? {
            id: org.customer.id,
            name: org.customer.name,
          }
        : undefined,
    }));
  }

  @Get('/social/:integration')
  @ApiOperation({
    summary: 'URL de OAuth para conectar um canal',
    description: 'Gera a URL de autenticação OAuth do provider.',
  })
  @ApiParam({
    name: 'integration',
    description: 'Identificador do provider (ex.: instagram, x)',
  })
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getIntegrationUrl(
    @Param('integration') integration: string,
    @Query('refresh') refresh: string,
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (
      !this._integrationManager
        .getAllowedSocialsIntegrations()
        .includes(integration)
    ) {
      throw new HttpException({ msg: 'Integration not allowed' }, 400);
    }

    const integrationProvider =
      this._integrationManager.getSocialIntegration(integration);

    if (integrationProvider.externalUrl) {
      throw new HttpException(
        {
          msg: 'This integration requires an external URL and is not supported via the public API',
        },
        400
      );
    }

    // chave de perfil so reconecta canal do proprio perfil (ou sem perfil)
    if (refresh && publicApiProfileId) {
      // inclusive canal desativado
      const existing =
        await this._integrationService.getChannelProfileByInternalId(
          org.id,
          refresh
        );
      if (existing?.profileId && existing.profileId !== publicApiProfileId) {
        throw new HttpException(
          { msg: 'Integration does not belong to this profile' },
          403
        );
      }
    }

    try {
      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl();

      if (refresh) {
        await ioRedis.set(`refresh:${state}`, refresh, 'EX', 3600);
      }

      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(`login:${state}`, codeVerifier, 'EX', 3600);

      // Chave de perfil: o callback do OAuth (`/integrations/social-connect`)
      // cria o canal no perfil gravado aqui, como o dashboard ja fazia.
      if (publicApiProfileId) {
        await ioRedis.set(`profile:${state}`, publicApiProfileId, 'EX', 3600);
      }

      return { url };
    } catch (err) {
      throw new HttpException({ msg: 'Failed to generate auth URL' }, 500);
    }
  }

  @Get('/media')
  @ApiOperation({
    summary: 'Listar a biblioteca de mídia',
    description:
      'Mídia já enviada, da mais recente para a mais antiga, 18 por página, com busca opcional pelo nome original. Chave de perfil: só a mídia do perfil (e a sem perfil).',
  })
  async getMedia(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Query() query: GetMediaDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const { pages, results } = await this._mediaService.getMedia(
      org.id,
      query.page || 1,
      publicApiProfileId,
      query.search
    );

    // so campos de exibicao: nada de contagens internas nem uso em posts
    return {
      pages,
      results: results.map((p: any) => ({
        id: p.id,
        name: p.name,
        originalName: p.originalName,
        path: p.path,
        createdAt: p.createdAt,
      })),
    };
  }

  @Get('/notifications')
  @ApiOperation({ summary: 'Listar notificações (paginadas)' })
  @ApiResponse({ status: 200, description: 'Notificações paginadas.' })
  async getNotifications(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Query() query: GetNotificationsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    // Chave de perfil ve apenas as notificacoes do proprio perfil (+ org-wide);
    // chave de organizacao segue com visibilidade total (escopo undefined).
    return this._notificationService.getNotificationsPaginated(
      org.id,
      query.page ?? 0,
      publicApiProfileId
        ? { isAdmin: false, profileIds: [publicApiProfileId] }
        : undefined
    );
  }

  @Post('/generate-video')
  @ApiOperation({
    summary: 'Gerar um vídeo (IA)',
    description: 'Gera um vídeo a partir do `type` e parâmetros.',
  })
  @ApiResponse({ status: 201, description: 'Vídeo gerado.' })
  @ApiResponse({ status: 400, description: 'Parâmetros inválidos.' })
  generateVideo(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Body() body: VideoDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    // chave de perfil: o video vai para a biblioteca do perfil
    return this._mediaService.generateVideo(org, body, publicApiProfileId);
  }

  @Post('/video/function')
  @ApiOperation({ summary: 'Executar função auxiliar de geração de vídeo' })
  videoFunction(@Body() body: VideoFunctionDto) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.videoFunction(
      body.identifier,
      body.functionName,
      body.params
    );
  }

  @Delete('/integrations/:id')
  @ApiOperation({ summary: 'Excluir um canal (integração) e seus posts' })
  @ApiParam({ name: 'id', description: 'integrationId' })
  async deleteChannel(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    // chave de perfil so apaga canais do proprio perfil (como as rotas irmas)
    if (publicApiProfileId) {
      await this._integrationService.validateIntegrationProfile(
        org.id,
        id,
        publicApiProfileId
      );
    }
    const isTherePosts = await this._integrationService.getPostsForChannel(
      org.id,
      id
    );
    if (isTherePosts.length) {
      for (const post of isTherePosts) {
        this._postsService.deletePost(org.id, post.group).catch(() => {});
      }
    }

    return this._integrationService.deleteChannel(org.id, id);
  }

  @Get('/integration-settings/:id')
  @ApiOperation({ summary: 'Configurações/validação de um canal' })
  @ApiParam({ name: 'id', description: 'integrationId' })
  async getIntegrationSettings(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (publicApiProfileId) {
      await this._integrationService.validateIntegrationProfile(
        org.id,
        id,
        publicApiProfileId
      );
    }
    const loadIntegration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );
    if (!loadIntegration) {
      throw new HttpException({ msg: 'Integration not found' }, 404);
    }

    const verified =
      JSON.parse(loadIntegration.additionalSettings || '[]')?.find(
        (p: any) => p?.title === 'Verified'
      )?.value || false;

    const integration = socialIntegrationList.find(
      (p) => p.identifier === loadIntegration.providerIdentifier
    )!;

    if (!integration) {
      return {
        output: { rules: '', maxLength: 0, settings: {}, tools: [] as any[] },
      };
    }

    const maxLength = integration.maxLength(verified);
    const schemas = !integration.dto
      ? false
      : getValidationSchemas()[integration.dto.name];
    const tools = this._integrationManager.getAllTools();
    const rules = this._integrationManager.getAllRulesDescription();

    return {
      output: {
        rules: rules[integration.identifier],
        maxLength,
        ...(integration.identifier === 'x'
          ? {
              articleMaxLength: integration.maxLength(verified, {
                post_type: 'article',
              }),
            }
          : {}),
        settings: !schemas ? 'No additional settings required' : schemas,
        tools: tools[integration.identifier],
      },
    };
  }

  @Get('/posts/:id/missing')
  @ApiOperation({ summary: 'Conteúdo faltante de um post' })
  @ApiParam({ name: 'id', description: 'ID do post' })
  async getMissingContent(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.getMissingContent(
      org.id,
      id,
      false,
      publicApiProfileId
    );
  }

  @Put('/posts/:id/release-id')
  @ApiOperation({ summary: 'Atualizar o release id de um post' })
  @ApiParam({ name: 'id', description: 'ID do post' })
  async updateReleaseId(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateReleaseIdDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.updateReleaseId(
      org.id,
      id,
      body.releaseId,
      publicApiProfileId
    );
  }

  @Get('/analytics/:integration')
  @ApiOperation({
    summary: 'Analytics de um canal',
    description: 'Estatísticas do canal nos últimos `date` dias.',
  })
  @ApiParam({ name: 'integration', description: 'integrationId do canal' })
  @ApiQuery({ name: 'date', description: 'Janela em dias (ex.: 7, 30)' })
  @ApiResponse({ status: 200, description: 'Dados analíticos do canal.' })
  async getAnalytics(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._integrationService.checkAnalytics(
      org,
      integration,
      date,
      false,
      publicApiProfileId
    );
  }

  @Get('/analytics/post/:postId')
  @ApiOperation({ summary: 'Analytics de um post específico' })
  @ApiParam({ name: 'postId', description: 'ID do post' })
  @ApiQuery({ name: 'date', description: 'Janela em dias' })
  @ApiResponse({ status: 200, description: 'Estatísticas do post.' })
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.checkPostAnalytics(
      org.id,
      postId,
      +date,
      false,
      publicApiProfileId
    );
  }

  @Post('/integration-trigger/:id')
  @ApiOperation({ summary: 'Executar ferramenta nativa de um canal' })
  @ApiParam({ name: 'id', description: 'integrationId' })
  async triggerIntegrationTool(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Param('id') id: string,
    @Body() body: TriggerToolDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (publicApiProfileId) {
      await this._integrationService.validateIntegrationProfile(
        org.id,
        id,
        publicApiProfileId
      );
    }
    const getIntegration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );

    if (!getIntegration) {
      throw new HttpException({ msg: 'Integration not found' }, 404);
    }
    getIntegration.token = decryptIntegrationToken(
      this._encryption,
      getIntegration.token
    );

    const integrationProvider = socialIntegrationList.find(
      (p) => p.identifier === getIntegration.providerIdentifier
    )!;

    if (!integrationProvider) {
      throw new HttpException({ msg: 'Integration provider not found' }, 404);
    }

    const tools = this._integrationManager.getAllTools();
    if (
      // @ts-ignore
      !tools[integrationProvider.identifier]?.some(
        (p: any) => p.methodName === body.methodName
      ) ||
      // @ts-ignore
      !integrationProvider[body.methodName]
    ) {
      throw new HttpException({ msg: 'Tool not found' }, 404);
    }

    while (true) {
      try {
        // @ts-ignore
        const result = await integrationProvider[body.methodName](
          getIntegration.token,
          body.data || {},
          getIntegration.internalId,
          getIntegration
        );

        return { output: result };
      } catch (err) {
        if (err instanceof RefreshToken) {
          const data = await this._refreshIntegrationService.refresh(
            getIntegration
          );

          if (!data) {
            await this._integrationService.disconnectChannel(
              org.id,
              getIntegration
            );
            throw new HttpException(
              { msg: 'Channel disconnected due to expired token' },
              401
            );
          }

          const { accessToken } = data;

          if (accessToken) {
            getIntegration.token = accessToken;

            if (integrationProvider.refreshWait) {
              await timer(10000);
            }

            continue;
          }
        }
        throw new HttpException({ msg: 'Unexpected error' }, 500);
      }
    }
  }
}
