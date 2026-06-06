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
import { Organization } from '@prisma/client';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { VideoFunctionDto } from '@gitroom/nestjs-libraries/dtos/videos/video.function.dto';
import { UploadDto } from '@gitroom/nestjs-libraries/dtos/media/upload.dto';
import { NotificationService } from '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service';
import { GetNotificationsDto } from '@gitroom/nestjs-libraries/dtos/notifications/get.notifications.dto';
import axios from 'axios';
import { Readable } from 'stream';
import { lookup, extension } from 'mime-types';
import * as Sentry from '@sentry/nestjs';
import { socialIntegrationList, IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

// Exemplos prontos exibidos no Swagger para POST /public/v1/posts. O body e
// processado como `any` (mapeado para CreatePostDto), entao fornecemos exemplos
// completos e copiaveis para quem usa a API/n8n.
const POST_BODY_EXAMPLES = {
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
              image: [{ id: 'media-1', path: 'https://seu-cdn.com/imagem.jpg' }],
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
  'rascunho': {
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
  private storage = UploadFactory.createStorage();

  constructor(
    private _integrationService: IntegrationService,
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _notificationService: NotificationService,
    private _integrationManager: IntegrationManager,
    private _refreshIntegrationService: RefreshIntegrationService
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
  @ApiResponse({ status: 201, description: 'Arquivo salvo (retorna id + path).' })
  @ApiResponse({ status: 400, description: 'Nenhum arquivo enviado.' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida.' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadSimple(
    @GetOrgFromRequest() org: Organization,
    @UploadedFile('file') file: Express.Multer.File
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (!file) {
      throw new HttpException({ msg: 'No file provided' }, 400);
    }

    const getFile = await this.storage.uploadFile(file);
    return this._mediaService.saveFile(
      org.id,
      getFile.originalname,
      getFile.path
    );
  }

  @Post('/upload-from-url')
  @ApiOperation({
    summary: 'Upload de mídia a partir de uma URL',
    description:
      'Baixa a mídia da `url` informada e salva. Retorna o objeto de mídia (com `id` e `path`) para usar em `image[].path` ao criar um post.',
  })
  @ApiResponse({ status: 201, description: 'Mídia da URL salva (retorna id + path).' })
  @ApiResponse({ status: 400, description: 'URL inválida ou inacessível.' })
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida.' })
  async uploadsFromUrl(
    @GetOrgFromRequest() org: Organization,
    @Body() body: UploadDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const response = await axios.get(body.url, {
      responseType: 'arraybuffer',
    });

    const buffer = Buffer.from(response.data);
    // AxiosHeaderValue agora é union (string | string[] | number | boolean);
    // só fazemos split em string.
    const contentTypeHeader = response.headers?.['content-type'];
    const responseMime =
      typeof contentTypeHeader === 'string'
        ? contentTypeHeader.split(';')[0]?.trim()
        : undefined;
    const urlMime = lookup(body?.url?.split?.('?')?.[0]);
    const mimetype = (urlMime || responseMime || 'image/jpeg') as string;
    const ext = extension(mimetype) || 'jpg';

    const getFile = await this.storage.uploadFile({
      buffer,
      mimetype,
      size: buffer.length,
      path: '',
      fieldname: '',
      destination: '',
      stream: new Readable(),
      filename: '',
      originalname: `upload.${ext}`,
      encoding: '',
    });

    return this._mediaService.saveFile(
      org.id,
      getFile.originalname,
      getFile.path
    );
  }

  @Get('/find-slot/:id')
  @ApiOperation({
    summary: 'Próximo horário livre para agendar',
    description: 'Retorna `{ date }` com o próximo horário disponível para agendar um post no canal.',
  })
  @ApiParam({ name: 'id', required: false, description: 'integrationId (opcional)' })
  @ApiResponse({ status: 200, description: 'Horário livre encontrado.' })
  async findSlotIntegration(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return { date: await this._postsService.findFreeDateTime(org.id, id) };
  }

  @Get('/posts')
  @ApiOperation({
    summary: 'Listar posts',
    description: 'Lista os posts da organização no intervalo `startDate`–`endDate`.',
  })
  @ApiResponse({ status: 200, description: 'Lista de posts.' })
  @ApiResponse({ status: 400, description: 'Parâmetros de query inválidos.' })
  async getPosts(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetPostsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const posts = await this._postsService.getPosts(org.id, query);
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
  @ApiResponse({ status: 401, description: 'Chave de API ausente ou inválida.' })
  @ApiResponse({ status: 403, description: 'Limite mensal de posts atingido.' })
  @CheckPolicies([AuthorizationActions.Create, Sections.POSTS_PER_MONTH])
  async createPost(
    @GetOrgFromRequest() org: Organization,
    @Body() rawBody: any
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const body = await this._postsService.mapTypeToPost(
      rawBody,
      org.id,
      rawBody.type === 'draft'
    );
    body.type = rawBody.type;

    console.log(JSON.stringify(body, null, 2));
    return this._postsService.createPost(org.id, body);
  }

  @Delete('/posts/:id')
  @ApiOperation({ summary: 'Excluir um post (e seu grupo)' })
  @ApiParam({ name: 'id', description: 'ID do post' })
  @ApiResponse({ status: 200, description: 'Post excluído.' })
  @ApiResponse({ status: 404, description: 'Post não encontrado.' })
  async deletePost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const getPostById = await this._postsService.getPost(org.id, id);
    return this._postsService.deletePost(org.id, getPostById.group);
  }

  @Delete('/posts/group/:group')
  @ApiOperation({ summary: 'Excluir todos os posts de um grupo' })
  @ApiParam({ name: 'group', description: 'ID do grupo de posts' })
  deletePostByGroup(
    @GetOrgFromRequest() org: Organization,
    @Param('group') group: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.deletePost(org.id, group);
  }

  @Get('/is-connected')
  @ApiOperation({ summary: 'Healthcheck da chave de API', description: 'Retorna `{ connected: true }` se a chave for válida.' })
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
    description: 'Filtra por perfil (chave de org). Chave de perfil só vê o próprio.',
  })
  @ApiResponse({ status: 200, description: 'Lista de canais (id, name, identifier, picture, ...).' })
  @ApiResponse({ status: 403, description: 'Chave de perfil tentando acessar outro perfil.' })
  async listIntegration(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() publicApiProfileId: string | undefined,
    @Query('profileId') profileId?: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    if (publicApiProfileId && profileId && profileId !== publicApiProfileId) {
      throw new HttpException({ msg: 'Profile key cannot access another profile' }, 403);
    }
    const effectiveProfileId = publicApiProfileId ?? profileId;
    return (await this._integrationService.getIntegrationsList(org.id, effectiveProfileId)).map(
      (org) => ({
        id: org.id,
        name: org.name,
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
      })
    );
  }

  @Get('/social/:integration')
  @ApiOperation({ summary: 'URL de OAuth para conectar um canal', description: 'Gera a URL de autenticação OAuth do provider.' })
  @ApiParam({ name: 'integration', description: 'Identificador do provider (ex.: instagram, x)' })
  @CheckPolicies([AuthorizationActions.Create, Sections.CHANNEL])
  async getIntegrationUrl(
    @Param('integration') integration: string,
    @Query('refresh') refresh: string,
    @GetOrgFromRequest() org: Organization
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
        { msg: 'This integration requires an external URL and is not supported via the public API' },
        400
      );
    }

    try {
      const { codeVerifier, state, url } =
        await integrationProvider.generateAuthUrl();

      if (refresh) {
        await ioRedis.set(`refresh:${state}`, refresh, 'EX', 3600);
      }

      await ioRedis.set(`organization:${state}`, org.id, 'EX', 3600);
      await ioRedis.set(`login:${state}`, codeVerifier, 'EX', 3600);

      return { url };
    } catch (err) {
      throw new HttpException({ msg: 'Failed to generate auth URL' }, 500);
    }
  }

  @Get('/notifications')
  @ApiOperation({ summary: 'Listar notificações (paginadas)' })
  @ApiResponse({ status: 200, description: 'Notificações paginadas.' })
  async getNotifications(
    @GetOrgFromRequest() org: Organization,
    @Query() query: GetNotificationsDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._notificationService.getNotificationsPaginated(
      org.id,
      query.page ?? 0
    );
  }

  @Post('/generate-video')
  @ApiOperation({ summary: 'Gerar um vídeo (IA)', description: 'Gera um vídeo a partir do `type` e parâmetros.' })
  @ApiResponse({ status: 201, description: 'Vídeo gerado.' })
  @ApiResponse({ status: 400, description: 'Parâmetros inválidos.' })
  generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: VideoDto
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._mediaService.generateVideo(org, body);
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
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
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
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const loadIntegration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );

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
    @Param('id') id: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.getMissingContent(org.id, id);
  }

  @Put('/posts/:id/release-id')
  @ApiOperation({ summary: 'Atualizar o release id de um post' })
  @ApiParam({ name: 'id', description: 'ID do post' })
  async updateReleaseId(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body('releaseId') releaseId: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.updateReleaseId(org.id, id, releaseId);
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
    @Param('integration') integration: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._integrationService.checkAnalytics(org, integration, date);
  }

  @Get('/analytics/post/:postId')
  @ApiOperation({ summary: 'Analytics de um post específico' })
  @ApiParam({ name: 'postId', description: 'ID do post' })
  @ApiQuery({ name: 'date', description: 'Janela em dias' })
  @ApiResponse({ status: 200, description: 'Estatísticas do post.' })
  async getPostAnalytics(
    @GetOrgFromRequest() org: Organization,
    @Param('postId') postId: string,
    @Query('date') date: string
  ) {
    Sentry.metrics.count('public_api-request', 1);
    return this._postsService.checkPostAnalytics(org.id, postId, +date);
  }

  @Post('/integration-trigger/:id')
  @ApiOperation({ summary: 'Executar ferramenta nativa de um canal' })
  @ApiParam({ name: 'id', description: 'integrationId' })
  async triggerIntegrationTool(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: { methodName: string; data: Record<string, string> }
  ) {
    Sentry.metrics.count('public_api-request', 1);
    const getIntegration = await this._integrationService.getIntegrationById(
      org.id,
      id
    );

    if (!getIntegration) {
      throw new HttpException({ msg: 'Integration not found' }, 404);
    }

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
