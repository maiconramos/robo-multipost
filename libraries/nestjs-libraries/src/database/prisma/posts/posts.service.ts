import {
  facebookStoryCommentError,
  facebookAllowsComments,
} from '../../../integrations/social/facebook.story-comments';
import { xArticleError } from '../../../integrations/social/x.article';
import { instagramAudioError } from '../../../integrations/social/instagram.audio';
import type { InstagramDto } from '../../../dtos/posts/providers-settings/instagram.dto';
import { createHash } from 'crypto';
import {
  CommentPlacementInput,
  CommentPlacement,
  assertAnchorMatches,
  hasPlacement,
  sanitizeCommentContent,
  sanitizeCommentName,
  toPublicPreviewComments,
  toMemberPreviewComments,
  isAnonymousPreviewCommentEnabled,
  verifyRecaptchaToken,
  consumeRateLimit,
} from './preview.comments';
import { CreateAnonymousCommentDto } from '@gitroom/nestjs-libraries/dtos/comments/add.comment.dto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import {
  isTikTokPhotoPost,
  TIKTOK_IDENTIFIERS,
  tiktokCaptionTooLong,
  tiktokPlainText,
} from '@gitroom/nestjs-libraries/integrations/social/tiktok.caption';
import { PostsRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.repository';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import dayjs from 'dayjs';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  CommentKind,
  Integration,
  Post,
  Media,
  From,
  State,
} from '@prisma/client';
import { GetPostsDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.dto';
import { GetPostsListDto } from '@gitroom/nestjs-libraries/dtos/posts/get.posts.list.dto';
import { groupBy, shuffle, uniqBy } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { CreateGeneratedPostsDto } from '@gitroom/nestjs-libraries/dtos/generator/create.generated.posts.dto';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import utc from 'dayjs/plugin/utc';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { ShortLinkService } from '@gitroom/nestjs-libraries/short-linking/short.link.service';
import { CreateTagDto } from '@gitroom/nestjs-libraries/dtos/posts/create.tag.dto';
import {
  minifyPostsList,
  minifyPosts,
} from '@gitroom/helpers/utils/posts.list.minify';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  filterAllowedMedia,
  isRemoteMediaPath,
} from '@gitroom/nestjs-libraries/database/prisma/posts/media.path.guard';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { Readable } from 'stream';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { AiTextService } from '@gitroom/nestjs-libraries/ai/ai-text.service';
dayjs.extend(utc);
import * as Sentry from '@sentry/nestjs';
import { TemporalService } from 'nestjs-temporal-core';
import { TypedSearchAttributes } from '@temporalio/common';
import {
  organizationId,
  postId as postIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { toPublicPost } from '@gitroom/nestjs-libraries/database/prisma/posts/post.response.projection';
import { RefreshIntegrationService } from '@gitroom/nestjs-libraries/integrations/refresh.integration.service';
import { StatusEventService } from '@gitroom/nestjs-libraries/database/prisma/status/status-event.service';
import { selectPostWorkflowVersion } from '@gitroom/nestjs-libraries/temporal/post-workflow-version';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { decryptIntegrationToken } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';

type PostWithConditionals = Post & {
  integration?: Integration;
  childrenPost: Post[];
};

@Injectable()
export class PostsService {
  private storage = UploadFactory.createStorage();
  private readonly _logger = new Logger(PostsService.name);

  constructor(
    private _postRepository: PostsRepository,
    private _integrationManager: IntegrationManager,
    private _integrationService: IntegrationService,
    private _mediaService: MediaService,
    private _shortLinkService: ShortLinkService,
    private _openaiService: OpenaiService,
    private _temporalService: TemporalService,
    private _refreshIntegrationService: RefreshIntegrationService,
    private _aiTextService: AiTextService,
    private _encryption: EncryptionService,
    private _statusEventService: StatusEventService
  ) {}

  searchForMissingThreeHoursPosts() {
    return this._postRepository.searchForMissingThreeHoursPosts();
  }

  // post no ar com falha num passo seguinte: guarda o link para o usuario abrir
  // o post em vez de publicar de novo (upstream 23beddcd). Hoje so o YouTube:
  // nao congela `scheduledAutomationTarget.publishedReleaseId` como o
  // updatePost (automacoes so existem para Facebook/Instagram)
  updatePublishedRelease(
    id: string,
    orgId: string,
    releaseId: string,
    releaseURL: string
  ) {
    return this._postRepository.updatePublishedRelease(
      id,
      orgId,
      releaseId,
      releaseURL
    );
  }

  updatePost(id: string, postId: string, releaseURL: string) {
    return this._postRepository.updatePost(id, postId, releaseURL);
  }

  getPostById(id: string) {
    return this._postRepository.getPostById(id);
  }

  async getMissingContent(
    orgId: string,
    postId: string,
    forceRefresh = false,
    profileId?: string
  ): Promise<{ id: string; url: string }[]> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || post.releaseId !== 'missing') {
      return [];
    }
    // chave/membro de perfil so alcanca posts (e canais) do proprio perfil —
    // antes de renovar token ou consultar o provider
    if (
      !this.postInProfile(post, profileId) ||
      !this.postInProfile({ profileId: post.integration?.profileId }, profileId)
    ) {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.missing) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    getIntegration.token = decryptIntegrationToken(
      this._encryption,
      getIntegration.token
    );
    try {
      return await integrationProvider.missing(
        getIntegration.internalId,
        getIntegration.token
      );
    } catch (e) {
      this._logger.warn(
        `getMissingContent failed (post=${postId}): ${summarizeError(e)}`
      );
      // uma nova tentativa so: RefreshToken depois do refresh recursava sempre
      if (e instanceof RefreshToken && !forceRefresh) {
        return this.getMissingContent(orgId, postId, true, profileId);
      }
    }

    return [];
  }

  // Escopo por perfil nas leituras/escritas por id: um membro (ou chave de
  // perfil) so alcanca posts do proprio perfil. 404 tambem para inexistente,
  // para a resposta nao virar oraculo de existencia.
  private postInProfile(
    post: { profileId?: string | null } | null | undefined,
    profileId?: string
  ): boolean {
    return (
      !!post && (!profileId || !post.profileId || post.profileId === profileId)
    );
  }

  private assertPostInProfile(
    post: { profileId?: string | null } | null | undefined,
    profileId?: string
  ) {
    if (!this.postInProfile(post, profileId)) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }
  }

  async updateReleaseId(
    orgId: string,
    postId: string,
    releaseId: string,
    profileId?: string
  ) {
    const post = await this._postRepository.getPostById(postId, orgId);
    this.assertPostInProfile(post, profileId);
    // post legado sem perfil: o canal tambem precisa ser do perfil
    this.assertPostInProfile(
      { profileId: post?.integration?.profileId },
      profileId
    );

    // a URL e um bonus: conectar nao pode falhar quando ela nao vem
    // (upstream #2212)
    let releaseURL: string | undefined;
    if (post?.releaseId === 'missing') {
      try {
        releaseURL = await this._integrationManager
          .getSocialIntegration(post.integration.providerIdentifier)
          .releaseUrl?.(
            decryptIntegrationToken(this._encryption, post.integration.token),
            String(releaseId),
            post.integration
          );
      } catch (e) {
        this._logger.warn(
          `releaseUrl falhou para o post ${postId}: ${summarizeError(e)}`
        );
      }
    }

    return this._postRepository.updateReleaseId(
      postId,
      orgId,
      releaseId,
      releaseURL
    );
  }

  // Porte do upstream #2186: providers que publicam antes de ter o id publico
  // (TikTok) guardam o publish_id como releaseId; aqui ele e trocado pelo id
  // definitivo (e a URL) assim que a plataforma o expoe, e persistido. Chamar
  // com o token ja descriptografado (post.integration e o mesmo objeto).
  async resolveRelease(
    orgId: string,
    post: {
      id: string;
      releaseId: string;
      releaseURL: string | null;
      settings?: string | null;
      integration: Integration;
    }
  ): Promise<{
    releaseId: string;
    releaseURL: string | null;
    pending?: boolean;
    unavailable?: boolean;
  }> {
    const stored = { releaseId: post.releaseId, releaseURL: post.releaseURL };
    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );
    if (!integrationProvider.resolveReleaseId) {
      return stored;
    }

    // Cache negativo curto: um post ainda sem id publico nao deve bater na
    // plataforma a cada abertura das estatisticas (GET sem throttle, mesmo
    // token e endpoint do polling de publicacao, rate limit por token).
    const unresolvedKey = `release-resolve:${orgId}:${post.id}`;
    const cached = await ioRedis.get(unresolvedKey);
    if (cached) {
      // 'pending': a plataforma ainda nao liberou o link; outro valor: nada a
      // resolver por enquanto (ex.: rascunho do TikTok ainda na caixa de entrada)
      return cached === 'pending' ? { ...stored, pending: true } : stored;
    }

    let settings: any = {};
    try {
      settings = JSON.parse(post.settings || '{}');
    } catch {
      settings = {};
    }

    const resolved = await integrationProvider.resolveReleaseId(
      post.integration.token,
      post.releaseId,
      post.integration,
      settings,
      post.releaseURL
    );
    if (!resolved || 'pending' in resolved) {
      await ioRedis.set(unresolvedKey, resolved ? 'pending' : '1', 'EX', 300);
      return { ...stored, pending: !!resolved };
    }
    if ('unavailable' in resolved) {
      return { ...stored, unavailable: true };
    }
    if (resolved.postId === post.releaseId) {
      return stored;
    }

    await this._postRepository.updateResolvedRelease(
      post.id,
      orgId,
      post.releaseId,
      resolved.postId,
      resolved.releaseURL
    );
    return { releaseId: resolved.postId, releaseURL: resolved.releaseURL };
  }

  // link do post publicado, resolvido no clique do icone do calendario
  // (upstream #2194, #2211): plataformas que liberam o id publico depois da
  // publicacao (TikTok) so sao consultadas aqui ou nas estatisticas
  async getReleaseURL(
    orgId: string,
    postId: string,
    profileId?: string,
    forceRefresh = false
  ): Promise<{
    releaseURL: string;
    pending?: boolean;
    unavailable?: boolean;
    reconnect?: boolean;
  }> {
    const post = await this._postRepository.getPostById(postId, orgId);
    this.assertPostInProfile(post, profileId);
    // post legado sem perfil: o canal tambem precisa ser do perfil
    this.assertPostInProfile(
      { profileId: post?.integration?.profileId },
      profileId
    );
    if (!post?.releaseURL) {
      return { releaseURL: '' };
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );
    if (!integrationProvider.resolveReleaseId || !post.releaseId) {
      return { releaseURL: post.releaseURL };
    }

    const getIntegration = post.integration!;

    // so renova depois que a plataforma recusar o token: post ja resolvido
    // nunca chega a plataforma
    if (forceRefresh) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return { releaseURL: post.releaseURL, reconnect: true };
      }

      if (data.accessToken) {
        getIntegration.token = data.accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return { releaseURL: post.releaseURL, reconnect: true };
      }
    }

    getIntegration.token = decryptIntegrationToken(
      this._encryption,
      getIntegration.token
    );

    try {
      const { releaseURL, pending, unavailable } = await this.resolveRelease(
        orgId,
        {
          id: post.id,
          releaseId: post.releaseId,
          releaseURL: post.releaseURL,
          settings: post.settings,
          integration: getIntegration,
        }
      );
      return {
        releaseURL: releaseURL || post.releaseURL,
        pending,
        unavailable,
      };
    } catch (e) {
      if (e instanceof RefreshToken && !forceRefresh) {
        return this.getReleaseURL(orgId, postId, profileId, true);
      }
      this._logger.warn(
        `getReleaseURL falhou para o post ${postId}: ${summarizeError(e)}`
      );
    }

    // falha (ou token recusado de novo): cliques seguidos nao voltam a
    // renovar o token nem a consultar a plataforma por 5 min
    await ioRedis.set(
      `release-resolve:${orgId}:${post.id}`,
      'pending',
      'EX',
      300
    );
    return { releaseURL: post.releaseURL, pending: true };
  }

  async checkPostAnalytics(
    orgId: string,
    postId: string,
    date: number,
    forceRefresh = false,
    profileId?: string
  ): Promise<AnalyticsData[] | { missing: true }> {
    const post = await this._postRepository.getPostById(postId, orgId);
    if (!post || !post.releaseId) {
      return [];
    }

    if (profileId && post.profileId && post.profileId !== profileId) {
      return [];
    }

    if (post.releaseId === 'missing') {
      return { missing: true };
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      post.integration.providerIdentifier
    );

    if (!integrationProvider.postAnalytics) {
      return [];
    }

    const getIntegration = post.integration!;

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this._integrationService.disconnectChannel(orgId, getIntegration);
        return [];
      }
    }

    // const getIntegrationData = await ioRedis.get(
    //   `integration:${orgId}:${post.id}:${date}`
    // );
    // if (getIntegrationData) {
    //   return JSON.parse(getIntegrationData);
    // }

    getIntegration.token = decryptIntegrationToken(
      this._encryption,
      getIntegration.token
    );
    try {
      // depois do decrypt acima e dentro do try: RefreshToken aqui tambem
      // cai no refresh + nova tentativa
      const { releaseId } = await this.resolveRelease(orgId, {
        id: post.id,
        releaseId: post.releaseId,
        releaseURL: post.releaseURL,
        settings: post.settings,
        integration: getIntegration,
      });

      const loadAnalytics = await integrationProvider.postAnalytics(
        getIntegration.internalId,
        getIntegration.token,
        releaseId,
        date,
        getIntegration
      );
      await ioRedis.set(
        `integration:${orgId}:${post.id}:${date}`,
        JSON.stringify(loadAnalytics),
        'EX',
        !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
          ? 1
          : 3600
      );
      return loadAnalytics;
    } catch (e) {
      this._logger.warn(
        `checkPostAnalytics failed (post=${postId}): ${summarizeError(e)}`
      );
      // uma nova tentativa so (upstream 96b78476): sem isto a recursao chamava
      // o refresh do provider para sempre
      if (e instanceof RefreshToken && !forceRefresh) {
        return this.checkPostAnalytics(orgId, postId, date, true, profileId);
      }
    }

    return [];
  }

  // `requireProfileId`: mesma regra das rotas de revisao (membro USER so no
  // proprio perfil -> 403; undefined = admin; post inexistente -> 404).
  async getStatistics(
    orgId: string,
    id: string,
    requireProfileId?: string | null
  ) {
    await this.assertPostReviewAccess(orgId, id, requireProfileId);
    const getPost = await this.getPostsRecursively(id, true, orgId, true);
    const content = getPost.map((p) => p.content);
    const shortLinksTracking = await this._shortLinkService.getStatistics(
      content
    );

    return {
      clicks: shortLinksTracking,
    };
  }

  // Data por canal e lote sao do editor do dashboard (upstream a194e3f4): a API
  // publica mantem uma data para a requisicao inteira.
  stripEditorOnlyFields<T>(rawBody: T): T {
    const body = rawBody as any;
    if (!body || !Array.isArray(body.posts)) {
      return rawBody;
    }
    return {
      ...body,
      posts: body.posts.map((post: any) => {
        if (!post || typeof post !== 'object') {
          return post;
        }
        const { date: _date, batchId: _batch, ...rest } = post;
        void _date;
        void _batch;
        return rest;
      }),
    } as T;
  }

  async mapTypeToPost(
    body: CreatePostDto,
    organization: string,
    replaceDraft: boolean = false
  ): Promise<CreatePostDto> {
    if (!body?.posts?.every((p) => p?.integration?.id)) {
      throw new BadRequestException('All posts must have an integration id');
    }

    const mappedValues = {
      ...body,
      type: replaceDraft ? 'schedule' : body.type,
      posts: await Promise.all(
        body.posts.map(async (post) => {
          const integration = await this._integrationService.getIntegrationById(
            organization,
            post.integration.id
          );

          if (!integration) {
            throw new BadRequestException(
              `Integration with id ${post.integration.id} not found`
            );
          }

          return {
            type: replaceDraft ? 'schedule' : body.type,
            ...post,
            settings: {
              ...(post.settings || ({} as any)),
              __type: integration.providerIdentifier,
            },
          };
        })
      ),
    };

    const validationPipe = new ValidationPipe({
      skipMissingProperties: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    });

    const validated = await validationPipe.transform(mappedValues, {
      type: 'body',
      metatype: CreatePostDto,
    });
    // Shared by create and the agent's edit/schedule actions.
    await this.assertSocialExtras(organization, validated);
    return validated;
  }

  async getPostsRecursively(
    id: string,
    includeIntegration = false,
    orgId?: string,
    isFirst?: boolean
  ): Promise<PostWithConditionals[]> {
    const post = await this._postRepository.getPost(
      id,
      includeIntegration,
      orgId,
      isFirst
    );

    if (!post) {
      return [];
    }

    return [
      post!,
      ...(post?.childrenPost?.length
        ? await this.getPostsRecursively(
            post?.childrenPost?.[0]?.id,
            false,
            orgId,
            false
          )
        : []),
    ];
  }

  async getPosts(orgId: string, query: GetPostsDto, profileId?: string) {
    return this._postRepository.getPosts(orgId, query, profileId);
  }

  async getPostsMinified(
    orgId: string,
    query: GetPostsDto,
    profileId?: string
  ) {
    return minifyPosts({
      posts: await this._postRepository.getPosts(orgId, query, profileId),
    });
  }

  async getPostsList(
    orgId: string,
    query: GetPostsListDto,
    profileId?: string
  ) {
    return minifyPostsList(
      await this._postRepository.getPostsList(orgId, query, profileId)
    );
  }

  async updateMedia(id: string, imagesList: any[], convertToJPEG = false) {
    // Filtra ANTES do try: o catch devolve a lista ao chamador, e caminhos
    // locais fora de UPLOAD_DIRECTORY viram leitura arbitraria de arquivo nos
    // providers (readOrFetch/createReadStream).
    const allowedList = filterAllowedMedia(imagesList);
    try {
      let imageUpdateNeeded = false;
      const getImageList = await Promise.all(
        (
          await Promise.all(
            allowedList.map(async (p: any) => {
              if (!p.path && p.id) {
                imageUpdateNeeded = true;
                return this._mediaService.getMediaById(p.id);
              }

              return p;
            })
          )
        )
          .map((m) => this.toMediaRecord(m))
          .map(async (m) => {
            if (!convertToJPEG) {
              return m;
            }

            if (m.path.indexOf('.png') > -1) {
              imageUpdateNeeded = true;
              // Caminho local ja confinado em UPLOAD_DIRECTORY: le do disco.
              // Remoto: baixa pelo cliente SSRF-safe (DNS pinning, sem IP
              // privado), nunca pelo axios global.
              const imageBuffer = isRemoteMediaPath(m.path)
                ? Buffer.from(
                    (
                      await getSsrfSafeAxios()({
                        url: m.url,
                        method: 'GET',
                        responseType: 'arraybuffer',
                      })
                    ).data
                  )
                : readFileSync(m.path);

              // Use sharp to get the metadata of the image
              const buffer = await sharp(imageBuffer)
                .jpeg({ quality: 100 })
                .toBuffer();

              const { path, originalname } = await this.storage.uploadFile({
                buffer,
                mimetype: 'image/jpeg',
                size: buffer.length,
                path: '',
                fieldname: '',
                destination: '',
                stream: new Readable(),
                filename: '',
                originalname: '',
                encoding: '',
              });

              return {
                ...m,
                name: originalname,
                url:
                  path.indexOf('http') === -1
                    ? process.env.FRONTEND_URL +
                      '/' +
                      process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
                      path
                    : path,
                type: 'image',
                path:
                  path.indexOf('http') === -1
                    ? process.env.UPLOAD_DIRECTORY + path
                    : path,
              };
            }

            return m;
          })
      );

      if (imageUpdateNeeded) {
        await this._postRepository.updateImages(
          id,
          JSON.stringify(getImageList)
        );
      }

      return getImageList;
    } catch (err: any) {
      // Falha no meio do processamento: devolve so o que da para resolver sem
      // IO, JA com o prefixo de UPLOAD_DIRECTORY. A lista crua tinha paths
      // relativos que o guard validou como "dentro de UPLOAD_DIRECTORY" mas que
      // chegariam ao provider como caminho absoluto (ex.: `/etc/passwd`).
      return allowedList
        .filter((m: any) => typeof m?.path === 'string')
        .map((m: any) => this.toMediaRecord(m));
    }
  }

  // Um `path` local (sem http) e servido pelo frontend em /uploads e lido do
  // disco em UPLOAD_DIRECTORY; remoto fica como esta. Puro: nunca lanca.
  // `any` de proposito: a lista de midia e tipada como `any` em toda a cadeia
  // (DTO -> updateMedia -> MediaContent[] no activity).
  private toMediaRecord(m: any): any {
    const isLocal = m.path.indexOf('http') === -1;
    return {
      ...m,
      url: isLocal
        ? process.env.FRONTEND_URL +
          '/' +
          process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY +
          m.path
        : m.path,
      type: 'image',
      path: isLocal ? process.env.UPLOAD_DIRECTORY + m.path : m.path,
    };
  }

  async getPostGroupDebugExport(orgId: string, group: string) {
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    const errors = await this._postRepository.getErrorsByPostIds(
      loadAll.map((p) => p.id)
    );
    const posts = this.arrangePostsByGroup(loadAll, undefined);
    const rootPost = posts[0] as any;

    return {
      type: 'draft' as const,
      shortLink: false,
      date: rootPost.publishDate.toISOString(),
      tags:
        rootPost.tags?.map((t: any) => ({
          value: t.tag.id,
          label: t.tag.name,
        })) || [],
      posts: [
        {
          integration: { id: 'REPLACE_WITH_LOCAL_INTEGRATION_ID' },
          group: rootPost.group,
          settings: JSON.parse(rootPost.settings || '{}'),
          value: posts.map((post) => ({
            content: post.content,
            image: JSON.parse(post.image || '[]'),
            delay: post.delay || 0,
          })),
        },
      ],
      _debug: {
        providerIdentifier: rootPost.integration?.providerIdentifier,
        providerName: rootPost.integration?.name,
        state: rootPost.state,
        error: rootPost.error,
        errors: errors.map((e) => ({
          message: e.message,
          platform: e.platform,
          body: e.body,
          createdAt: e.createdAt,
        })),
        originalGroup: group,
        originalPublishDate: rootPost.publishDate,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  async getPostsByGroup(orgId: string, group: string, profileId?: string) {
    const convertToJPEG = false;
    const loadAll = await this._postRepository.getPostsByGroup(orgId, group);
    // um grupo pode ter raizes de perfis diferentes (chave de org / MCP): o
    // membro so ve as do proprio perfil, mesmo escopo do deletePost por grupo
    const inProfile = profileId
      ? loadAll.filter((post) => this.postInProfile(post, profileId))
      : loadAll;
    const posts = this.arrangePostsByGroup(inProfile, undefined);
    this.assertPostInProfile(posts?.[0], profileId);

    // os outros canais com que o post foi criado (upstream a194e3f4): so do
    // perfil do post aberto (e do chamador), um por canal, mesma repeticao —
    // filtrado antes de tocar na midia deles
    const anchor = posts[0];
    const anchorProfileId = anchor.profileId ?? null;
    const batch =
      anchor.batchId && (!profileId || anchorProfileId === profileId)
        ? await this._postRepository.getPostsByBatch(
            orgId,
            anchor.batchId,
            group,
            anchorProfileId
          )
        : [];
    const siblings = uniqBy(
      Object.values(groupBy(batch, (post) => post.group))
        .map(
          (batchPosts) =>
            this.arrangePostsByGroup(batchPosts, undefined) as any[]
        )
        .filter(
          (batchPosts) =>
            batchPosts.length &&
            batchPosts[0].profileId === anchorProfileId &&
            batchPosts[0].integrationId !== anchor.integrationId &&
            batchPosts[0].intervalInDays === anchor.intervalInDays
        ),
      (batchPosts) => batchPosts[0].integrationId
    );

    return {
      ...(await this.groupForEditor(posts, convertToJPEG)),
      siblings: await Promise.all(
        siblings.map((batchPosts) => this.groupForEditor(batchPosts))
      ),
    };
  }

  // o post como o editor carrega: projecao publica (sem tokens do canal)
  private async groupForEditor(
    posts: PostWithConditionals[],
    convertToJPEG = false
  ) {
    return {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...toPublicPost(post),
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };
  }

  arrangePostsByGroup(all: any, parent?: string): PostWithConditionals[] {
    const findAll = all
      .filter((p: any) =>
        !parent ? !p.parentPostId : p.parentPostId === parent
      )
      .map(({ integration, ...all }: any) => ({
        ...all,
        ...(!parent ? { integration } : {}),
      }));

    return [
      ...findAll,
      ...(findAll.length
        ? findAll.flatMap((p: any) => this.arrangePostsByGroup(all, p.id))
        : []),
    ];
  }

  async getPost(
    orgId: string,
    id: string,
    convertToJPEG = false,
    profileId?: string
  ) {
    const posts = await this.getPostsRecursively(id, true, orgId, true);
    this.assertPostInProfile(posts?.[0], profileId);
    const list = {
      group: posts?.[0]?.group,
      posts: await Promise.all(
        (posts || []).map(async (post) => ({
          ...toPublicPost(post),
          image: await this.updateMedia(
            post.id,
            JSON.parse(post.image || '[]'),
            convertToJPEG
          ),
        }))
      ),
      integrationPicture: posts[0]?.integration?.picture,
      integration: posts[0].integrationId,
      settings: JSON.parse(posts[0].settings || '{}'),
    };

    return list;
  }

  async getOldPosts(orgId: string, date: string, profileId?: string | null) {
    return this._postRepository.getOldPosts(orgId, date, profileId);
  }

  public async updateTags(orgId: string, post: Post[]): Promise<Post[]> {
    const plainText = JSON.stringify(post);
    const extract = Array.from(
      plainText.match(/\(post:[a-zA-Z0-9-_]+\)/g) || []
    );
    if (!extract.length) {
      return post;
    }

    const ids = (extract || []).map((e) =>
      e.replace('(post:', '').replace(')', '')
    );
    const urls = await this._postRepository.getPostUrls(orgId, ids);
    const replaceTags = (text: string, escape = (url: string) => url) =>
      ids.reduce((acc, value) => {
        const findUrl = urls?.find?.((u) => u.id === value)?.releaseURL || '';
        return acc.replace(new RegExp(`\\(post:${value}\\)`, 'g'), () =>
          escape(findUrl.split(',')[0])
        );
      }, text);

    // A release URL e o que a plataforma respondeu: so entra onde uma tag foi
    // escrita — content e settings (escapada para o JSON deles) — e nunca na
    // lista de midia, validada antes disto. Substituir no JSON inteiro
    // permitia injetar um caminho de arquivo na midia via (post:ID)
    // (CVE-2026-115932, CWE-74).
    return post.map((p) => ({
      ...p,
      content: p.content && replaceTags(p.content),
      settings:
        p.settings &&
        replaceTags(p.settings, (url) => JSON.stringify(url).slice(1, -1)),
    }));
  }

  public async checkInternalPlug(
    integration: Integration,
    orgId: string,
    id: string,
    settings: any
  ) {
    const plugs = Object.entries(settings).filter(([key]) => {
      return key.indexOf('plug-') > -1;
    });

    if (plugs.length === 0) {
      return [];
    }

    const parsePlugs = plugs.reduce((all, [key, value]) => {
      const [_, name, identifier] = key.split('--');
      all[name] = all[name] || { name };
      all[name][identifier] = value;
      return all;
    }, {} as any);

    const list: {
      name: string;
      integrations: { id: string }[];
      delay: string;
      active: boolean;
    }[] = Object.values(parsePlugs);

    return (list || []).flatMap((trigger) => {
      return (trigger?.integrations || []).flatMap((int) => ({
        type: 'internal-plug',
        post: id,
        originalIntegration: integration.id,
        integration: int.id,
        plugName: trigger.name,
        orgId: orgId,
        delay: +trigger.delay,
        information: trigger,
      }));
    });
  }

  public async checkPlugs(
    orgId: string,
    providerName: string,
    integrationId: string
  ) {
    const loadAllPlugs = this._integrationManager.getAllPlugs();
    const getPlugs = await this._integrationService.getPlugs(
      orgId,
      integrationId
    );

    const currentPlug = loadAllPlugs.find((p) => p.identifier === providerName);

    return getPlugs
      .filter((plug) => {
        return currentPlug?.plugs?.some(
          (p: any) => p.methodName === plug.plugFunction
        );
      })
      .map((plug) => {
        const runPlug = currentPlug?.plugs?.find(
          (p: any) => p.methodName === plug.plugFunction
        )!;
        return {
          type: 'global',
          plugId: plug.id,
          delay: runPlug.runEveryMilliseconds,
          totalRuns: runPlug.totalRuns,
        };
      });
  }

  async deletePost(orgId: string, group: string, profileId?: string) {
    const post = await this._postRepository.deletePost(orgId, group, profileId);

    if (post?.id) {
      try {
        const workflows = this._temporalService.client
          .getRawClient()
          ?.workflow.list({
            query: `postId="${post.id}" AND ExecutionStatus="Running"`,
          });

        for await (const executionInfo of workflows) {
          try {
            const workflow =
              await this._temporalService.client.getWorkflowHandle(
                executionInfo.workflowId
              );
            if (
              workflow &&
              (await workflow.describe()).status.name !== 'TERMINATED'
            ) {
              await workflow.terminate();
            }
          } catch (err) {}
        }
      } catch (err) {}

      return { id: post.id };
    }

    return { error: true };
  }

  async countPostsFromDay(orgId: string, date: Date) {
    return this._postRepository.countPostsFromDay(orgId, date);
  }

  getPostByForWebhookId(id: string, integrationId: string) {
    return this._postRepository.getPostByForWebhookId(id, integrationId);
  }

  async startWorkflow(
    taskQueue: string,
    postId: string,
    orgId: string,
    state: State,
    integration: { id: string; providerIdentifier: string },
    options?: {
      strict?: boolean;
      stopOnly?: boolean;
      deadlineApplied?: boolean;
    }
  ): Promise<void> {
    if (options?.strict && state === 'PUBLISHED' && !options.stopOnly)
      throw new HttpException('POST_SYNC_STATE_UNSUPPORTED', 409);
    if (options?.strict && !options.deadlineApplied) {
      const client = this._temporalService.client.getRawClient();
      if (!client?.workflow?.withDeadline)
        throw new HttpException('POST_SCHEDULE_UNAVAILABLE', 503);
      return client.workflow.withDeadline(Date.now() + 10000, () =>
        this.startWorkflow(taskQueue, postId, orgId, state, integration, {
          ...options,
          deadlineApplied: true,
        })
      );
    }
    try {
      const workflows = this._temporalService.client
        .getRawClient()
        ?.workflow.list({
          query: `postId=${JSON.stringify(
            postId
          )} AND ExecutionStatus="Running"`,
        });

      for await (const executionInfo of workflows) {
        try {
          const workflow = await this._temporalService.client.getWorkflowHandle(
            executionInfo.workflowId
          );
          if (
            workflow &&
            (await workflow.describe()).status.name !== 'TERMINATED'
          ) {
            await workflow.terminate();
          }
        } catch (err) {
          if (
            options?.strict &&
            (err as Error)?.name !== 'WorkflowNotFoundError'
          )
            throw err;
        }
      }
    } catch (err) {
      if (options?.strict) throw err;
    }

    if (state === 'DRAFT' || options?.stopOnly) {
      return;
    }

    try {
      const workflowName = selectPostWorkflowVersion({
        integrationId: integration.id,
        providerIdentifier: integration.providerIdentifier,
      });
      await this._temporalService.client
        .getRawClient()
        ?.workflow.start(workflowName, {
          workflowId: `post_${postId}`,
          taskQueue: 'main',
          workflowIdConflictPolicy: 'TERMINATE_EXISTING',
          args: [
            {
              taskQueue: taskQueue,
              postId: postId,
              organizationId: orgId,
            },
          ],
          typedSearchAttributes: new TypedSearchAttributes([
            {
              key: postIdSearchParam,
              value: postId,
            },
            {
              key: organizationId,
              value: orgId,
            },
          ]),
        });
    } catch (err) {
      if (options?.strict) throw err;
    }
  }

  // Texto que o TikTok (nativo ou via Zernio) vai recusar e barrado na criacao
  // — dashboard, API publica, MCP e CLI passam por aqui. Antes ia para a fila
  // e voltava como `invalid_params` generico na hora de publicar.
  private assertTikTokTextLength(body: CreatePostDto) {
    for (const post of body.posts || []) {
      if (!TIKTOK_IDENTIFIERS.includes(post?.settings?.__type)) {
        continue;
      }
      const [first] = post.value || [];
      if (!first) {
        continue;
      }
      const tooLong = tiktokCaptionTooLong(
        tiktokPlainText(first.content || ''),
        isTikTokPhotoPost(first.image as Array<{ path?: string }>)
      );
      if (tooLong) {
        throw new BadRequestException(tooLong);
      }
    }
  }

  private async assertSocialExtras(
    orgId: string,
    body: CreatePostDto,
    existingPosts: Pick<Post, 'id' | 'settings'>[] = []
  ) {
    if (body.type === 'draft') return;
    for (const post of body.posts || []) {
      const stored = existingPosts.find((p) => p.id === post.value?.[0]?.id);
      let effectiveSettings = post.settings;
      if (effectiveSettings == null && stored) {
        try {
          effectiveSettings = JSON.parse(stored.settings || '{}');
        } catch {
          throw new BadRequestException('Configuração do post inválida.');
        }
      }
      const settings = effectiveSettings as Omit<
        Partial<InstagramDto>,
        'post_type'
      > & {
        post_type?: string;
        text_format_preset_id?: string;
      };
      if (
        settings?.audio == null &&
        !settings?.text_format_preset_id &&
        settings?.post_type !== 'article' &&
        post.value?.length <= 1
      )
        continue;
      const integration = await this._integrationService.getIntegrationById(
        orgId,
        post.integration.id
      );
      if (!integration) throw new BadRequestException('Integration not found');
      this.assertTumblrThread(
        integration.providerIdentifier,
        post.value?.length || 0
      );
      const storyCommentError = facebookStoryCommentError(
        settings,
        post.value?.length || 0,
        integration.providerIdentifier
      );
      if (storyCommentError) throw new BadRequestException(storyCommentError);
      if (settings?.post_type === 'article') {
        const error = xArticleError(
          settings,
          post.value.map((p) => p.image || []),
          post.value.map((p) => p.content),
          integration.providerIdentifier === 'x',
          JSON.parse(integration.additionalSettings || '[]')
        );
        if (error) throw new BadRequestException(error);
      }

      if (settings?.audio != null) {
        const error = instagramAudioError(
          settings as Partial<InstagramDto>,
          post.value?.[0]?.image || [],
          integration.providerIdentifier === 'instagram'
        );
        if (error) throw new BadRequestException(error);
      }
      if (
        settings?.text_format_preset_id &&
        integration.providerIdentifier !== 'facebook'
      ) {
        throw new BadRequestException(
          'Este fundo exige um canal nativo do Facebook.'
        );
      }
    }
  }

  // Runtime guard for chains queued before validation existed. No provider calls.
  async unsupportedCommentThreadError(
    integration: Pick<Integration, 'providerIdentifier' | 'organizationId'>,
    posts: Post[],
    commenting = false
  ): Promise<string | undefined> {
    if (
      !['facebook', 'zernio-facebook'].includes(
        integration.providerIdentifier
      ) ||
      !posts[0]
    )
      return undefined;
    const firstSettings = JSON.parse(posts[0].settings || '{}');
    if (!commenting && firstSettings.post_type !== 'story') return undefined;
    const chain = posts[0].group
      ? await this._postRepository.getPostsByGroup(
          integration.organizationId,
          posts[0].group
        )
      : posts;
    const root = chain?.find((p) => !p.parentPostId) || posts[0];
    return facebookStoryCommentError(
      JSON.parse(root.settings || '{}'),
      Math.max(commenting ? 2 : 0, posts.length, chain?.length || 0),
      integration.providerIdentifier
    );
  }

  private assertTumblrThread(providerIdentifier: string, count: number) {
    if (providerIdentifier === 'tumblr' && count > 1) {
      throw new BadRequestException(
        'Tumblr aceita um único post, sem blocos de comentários. Remova os blocos extras para este canal.'
      );
    }
  }

  private guardAgainstRepublish(
    post: {
      state: State;
      publishDate: Date;
      releaseId?: string | null;
      integration?: { providerIdentifier: string };
    } | null,
    source: 'createPost' | 'changeDate'
  ) {
    // ERROR com id na plataforma: entrou no ar e falhou num passo seguinte
    // (ou QUEUE aceito por provider assincrono): publicar de novo
    // subiria o video outra vez
    const liveWithError =
      (post?.state === 'ERROR' || post?.state === 'QUEUE') &&
      !!post.releaseId &&
      post.releaseId !== 'missing';
    if (post?.state !== 'PUBLISHED' && !liveWithError) {
      return;
    }

    const safeUpdate =
      source === 'createPost' ? "use type 'update'" : "use action 'update'";

    throw new BadRequestException(
      `This post was already published on ${dayjs
        .utc(post.publishDate)
        .format(
          'YYYY-MM-DD HH:mm'
        )} UTC. Saving it this way would publish it again to ${
        post.integration?.providerIdentifier || 'the channel'
      }. To edit without republishing, ${safeUpdate}. To intentionally publish again, pass republish: true.`
    );
  }

  async createPost(
    orgId: string,
    body: CreatePostDto,
    profileId?: string
  ): Promise<any[]> {
    const existingPostIds = [
      ...new Set(
        body.posts.flatMap((post) =>
          (post.value || []).flatMap((value) => (value.id ? [value.id] : []))
        )
      ),
    ];
    const existingPosts = [];

    for (const existingPostId of existingPostIds) {
      const existingPost = await this._postRepository.getPostById(
        existingPostId,
        orgId
      );
      if (!existingPost) {
        // `value[].id` nao e necessariamente um post existente: a UI gera o id
        // com `makeId(10)` antes de salvar e o upsert cria a linha com ele.
        // So e sequestro quando o id ja existe fora desta organizacao, porque
        // ai o `where: { id }` do upsert alcancaria o post alheio. Um id que
        // nao existe em lugar nenhum e simplesmente um post novo.
        const foreignPost = await this._postRepository.getPostById(
          existingPostId
        );
        if (foreignPost) {
          // Mesma mensagem do caso inexistente, de proposito: nao confirmar a
          // existencia de um post de outra organizacao.
          throw new BadRequestException('Post not found');
        }
        continue;
      }
      if (
        profileId &&
        existingPost.profileId &&
        existingPost.profileId !== profileId
      ) {
        throw new BadRequestException('Post does not belong to this profile');
      }
      existingPosts.push(existingPost);
    }

    if (
      (body.type === 'schedule' || body.type === 'now') &&
      body.republish !== true
    ) {
      for (const existingPost of existingPosts) {
        this.guardAgainstRepublish(existingPost, 'createPost');
      }
    }

    // com encurtador o texto muda depois daqui: o provider checa de novo antes
    // de publicar, com a mesma mensagem
    if (body.type !== 'draft' && !body.shortLink) {
      this.assertTikTokTextLength(body);
    }

    // canal de cada post precisa ser do perfil: a API publica e a tool MCP ja
    // validavam na borda, o dashboard nao — aqui vale para todas as entradas
    if (profileId) {
      for (const post of body.posts) {
        if (post?.integration?.id) {
          await this._integrationService.validateIntegrationProfile(
            orgId,
            post.integration.id,
            profileId
          );
        }
      }
    }

    await this.assertSocialExtras(orgId, body, existingPosts);

    const postList = [];
    // lote (upstream a194e3f4): um por perfil de destino, so com mais de um
    // canal; canal sem perfil nao entra em lote. batchId do cliente e ignorado.
    const batchIds = new Map<string, string>();
    for (const post of body.posts) {
      const messages = (post.value || []).map((p) => p.content);
      const updateContent = !body.shortLink
        ? messages
        : await this._shortLinkService.convertTextToShortLinks(orgId, messages);

      post.value = (post.value || []).map((p, i) => ({
        ...p,
        content: updateContent[i],
      }));

      // Posts inherit the profile of their target channel when no explicit
      // profileId is provided (e.g. org-scoped public API / MCP keys). Without
      // this, the post is created orphaned (profileId NULL) and stays invisible
      // in every profile-filtered calendar until the startup orphan migration.
      let effectiveProfileId = profileId;
      if (!effectiveProfileId && post?.integration?.id) {
        const integration = await this._integrationService.getIntegrationById(
          orgId,
          post.integration.id
        );
        effectiveProfileId = integration?.profileId ?? undefined;
      }

      let batchId: string | undefined;
      if (body.posts.length > 1 && effectiveProfileId) {
        batchId = batchIds.get(effectiveProfileId) || uuidv4();
        batchIds.set(effectiveProfileId, batchId);
      }

      const { posts } = await this._postRepository.createOrUpdatePost(
        body.type,
        orgId,
        // canal com data propria (editor do lote); os outros usam a do post
        body.type === 'now'
          ? dayjs().format('YYYY-MM-DDTHH:mm:00')
          : post.date || body.date,
        post,
        body.tags,
        body.inter,
        effectiveProfileId,
        batchId
      );

      if (!posts?.length) {
        return [] as any[];
      }

      if (body.type !== 'update') {
        this.startWorkflow(
          post.settings.__type.startsWith('zernio-')
            ? 'main'
            : post.settings.__type.split('-')[0].toLowerCase(),
          posts[0].id,
          orgId,
          posts[0].state,
          {
            id: post.integration.id,
            providerIdentifier: post.settings.__type,
          }
        ).catch((err) => {});
      }

      Sentry.metrics.count('post_created', 1);
      postList.push({
        postId: posts[0].id,
        integration: post.integration.id,
      });
    }

    return postList;
  }

  async separatePosts(
    orgId: string,
    content: string,
    len: number,
    profileId?: string
  ) {
    return this._aiTextService.separatePosts(orgId, content, len, profileId);
  }

  async changeState(id: string, state: State, err?: any, body?: any) {
    const updated = await this._postRepository.changeState(
      id,
      state,
      err,
      body
    );

    if (state === 'ERROR') {
      // Histórico (fail-soft): registra a falha de publicação com snapshot do
      // canal. Mensagem SANITIZADA (name+message) — NUNCA `JSON.stringify(err)`
      // (o corpo cru pode conter refresh_token/client_secret, é o vazamento que
      // a Fase 1 tirou da API). O snapshot vem do próprio retorno, sem query extra.
      await this._statusEventService.record({
        organizationId: updated.organizationId,
        type: 'POST_FAILED',
        severity: 'CRITICAL',
        message: this.sanitizeErrorMessage(err),
        profileId: updated.profileId ?? null,
        integrationId: updated.integrationId ?? null,
        channelName: updated.integration?.name ?? null,
        channelPicture: updated.integration?.picture ?? null,
        providerIdentifier: updated.integration?.providerIdentifier ?? null,
        entityId: updated.id,
      });
    }

    return updated;
  }

  // Extrai apenas name+message do erro de publicação para o log — NUNCA o corpo
  // serializado (que pode carregar o token). Objetos sem forma de Error viram
  // null (não serializamos). O cap de tamanho final é aplicado no StatusEventService.
  private sanitizeErrorMessage(err?: any): string | null {
    if (err == null) {
      return null;
    }
    if (typeof err === 'string') {
      return err;
    }
    if (err instanceof Error || (err?.name && err?.message)) {
      return `${err.name}: ${err.message}`;
    }
    return null;
  }

  async changeDate(
    orgId: string,
    id: string,
    date: string,
    action: 'schedule' | 'update' = 'update',
    profileId?: string,
    republish: boolean = false
  ) {
    const getPostById = await this._postRepository.getPostById(id, orgId);

    if (
      profileId &&
      getPostById?.profileId &&
      getPostById.profileId !== profileId
    ) {
      throw new BadRequestException('Post does not belong to this profile');
    }

    if (action === 'schedule' && republish !== true) {
      this.guardAgainstRepublish(getPostById, 'changeDate');
    }

    if (
      getPostById.integration.providerIdentifier === 'tumblr' &&
      (action === 'schedule' || getPostById.state === 'QUEUE')
    ) {
      const chain = await this._postRepository.getPostsByGroup(
        orgId,
        getPostById.group
      );
      this.assertTumblrThread('tumblr', chain.length);
    }

    if (action === 'schedule' || getPostById.state === 'QUEUE') {
      let settings: any;
      try {
        settings = JSON.parse(getPostById.settings || '{}');
      } catch {
        throw new BadRequestException('Configuração do post inválida.');
      }
      if (
        !facebookAllowsComments(
          settings,
          getPostById.integration.providerIdentifier
        )
      ) {
        const chain = await this._postRepository.getPostsByGroup(
          orgId,
          getPostById.group
        );
        const error = facebookStoryCommentError(
          settings,
          chain.length,
          getPostById.integration.providerIdentifier
        );
        if (error) throw new BadRequestException(error);
      }
      if (settings.post_type === 'article') {
        if (getPostById.integration.providerIdentifier !== 'x')
          throw new BadRequestException(
            'Artigos exigem uma conexão nativa do X.'
          );
        const chain = await this.getPostsRecursively(
          getPostById.id,
          false,
          orgId,
          true
        );
        if (!chain.length)
          throw new BadRequestException('Artigo não encontrado.');
        let media: { path: string }[][];
        try {
          media = chain.map((p) => JSON.parse(p.image || '[]'));
        } catch {
          throw new BadRequestException('Mídia do artigo inválida.');
        }
        const error = xArticleError(
          settings,
          media,
          chain.map((p) => p.content),
          true,
          JSON.parse(getPostById.integration.additionalSettings || '[]')
        );
        if (error) throw new BadRequestException(error);
      }
    }

    // schedule: Set status to QUEUE and change date (reschedule the post)
    // update: Just change the date without changing the status
    const newDate = await this._postRepository.changeDate(
      orgId,
      id,
      date,
      getPostById.state === 'DRAFT',
      action
    );

    if (action === 'schedule') {
      try {
        await this.startWorkflow(
          getPostById.integration.providerIdentifier.startsWith('zernio-')
            ? 'main'
            : getPostById.integration.providerIdentifier
                .split('-')[0]
                .toLowerCase(),
          getPostById.id,
          orgId,
          getPostById.state === 'DRAFT' ? 'DRAFT' : 'QUEUE',
          {
            id: getPostById.integration.id,
            providerIdentifier: getPostById.integration.providerIdentifier,
          }
        );
      } catch (err) {}
    }

    return newDate;
  }

  async generatePostsDraft(
    orgId: string,
    body: CreateGeneratedPostsDto,
    profileId?: string
  ) {
    const getAllIntegrations = (
      await this._integrationService.getIntegrationsList(orgId, profileId)
    ).filter((f) => !f.disabled && f.providerIdentifier !== 'reddit');

    // const posts = chunk(body.posts, getAllIntegrations.length);
    const allDates = dayjs()
      .isoWeek(body.week)
      .year(body.year)
      .startOf('isoWeek');

    const dates = [...new Array(7)].map((_, i) => {
      return allDates.add(i, 'day').format('YYYY-MM-DD');
    });

    const findTime = (): string => {
      const totalMinutes = Math.floor(Math.random() * 144) * 10;

      // Convert total minutes to hours and minutes
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      // Format hours and minutes to always be two digits
      const formattedHours = hours.toString().padStart(2, '0');
      const formattedMinutes = minutes.toString().padStart(2, '0');
      const randomDate =
        shuffle(dates)[0] + 'T' + `${formattedHours}:${formattedMinutes}:00`;

      if (dayjs(randomDate).isBefore(dayjs())) {
        return findTime();
      }

      return randomDate;
    };

    for (const integration of getAllIntegrations) {
      for (const toPost of body.posts) {
        const group = makeId(10);
        const randomDate = findTime();

        await this.createPost(
          orgId,
          {
            type: 'draft',
            date: randomDate,
            order: '',
            shortLink: false,
            tags: [],
            posts: [
              {
                group,
                integration: {
                  id: integration.id,
                },
                settings: {
                  __type: integration.providerIdentifier as any,
                  title: '',
                  tags: [],
                  subreddit: [],
                },
                value: [
                  ...toPost.list.map((l) => ({
                    id: '',
                    content: l.post,
                    delay: 0,
                    image: [],
                  })),
                  {
                    id: '',
                    delay: 0,
                    content: `Check out the full story here:\n${
                      body.postId || body.url
                    }`,
                    image: [],
                  },
                ],
              },
            ],
          },
          profileId
        );
      }
    }
  }

  findAllExistingCategories() {
    return this._postRepository.findAllExistingCategories();
  }

  findAllExistingTopicsOfCategory(category: string) {
    return this._postRepository.findAllExistingTopicsOfCategory(category);
  }

  findPopularPosts(category: string, topic?: string) {
    return this._postRepository.findPopularPosts(category, topic);
  }

  async findFreeDateTime(
    orgId: string,
    integrationId?: string,
    profileId?: string
  ) {
    // os horarios de um canal so para quem alcanca o canal (dashboard e API)
    if (integrationId && profileId) {
      await this._integrationService.validateIntegrationProfile(
        orgId,
        integrationId,
        profileId
      );
    }
    const findTimes = await this._integrationService.findFreeDateTime(
      orgId,
      integrationId
    );
    // sem canal ativo nao ha horarios: usa os horarios padrao do canal novo
    // em vez de recursar para sempre (upstream #2207)
    return this.findFreeDateTimeRecursive(
      orgId,
      findTimes.length ? findTimes : [120, 400, 700],
      dayjs.utc().startOf('day'),
      profileId,
      0
    );
  }

  async createPopularPosts(post: {
    category: string;
    topic: string;
    content: string;
    hook: string;
  }) {
    return this._postRepository.createPopularPosts(post);
  }

  private async findFreeDateTimeRecursive(
    orgId: string,
    times: number[],
    date: dayjs.Dayjs,
    profileId: string | undefined,
    daysChecked: number
  ): Promise<string> {
    // para depois de um ano: a busca nunca pode ficar sem fim
    if (daysChecked > 365) {
      return date
        .clone()
        .add(times[0] || 0, 'minutes')
        .format('YYYY-MM-DDTHH:mm:00');
    }

    const list = await this._postRepository.getPostsCountsByDates(
      orgId,
      times,
      date,
      profileId
    );

    if (!list.length) {
      return this.findFreeDateTimeRecursive(
        orgId,
        times,
        date.add(1, 'day'),
        profileId,
        daysChecked + 1
      );
    }

    const num = list.reduce<null | number>((prev, curr) => {
      if (prev === null || prev > curr) {
        return curr;
      }
      return prev;
    }, null) as number;

    return date.clone().add(num, 'minutes').format('YYYY-MM-DDTHH:mm:00');
  }

  async getComments(postId: string) {
    const thread = await this.previewThread(postId);
    return toPublicPreviewComments(
      await this._postRepository.getComments(thread.map((post) => post.id))
    );
  }

  async getReviewComments(
    orgId: string,
    postId: string,
    requireProfileId?: string | null
  ) {
    await this.assertPostReviewAccess(orgId, postId, requireProfileId);
    const thread = await this.previewThread(postId, orgId);
    return toMemberPreviewComments(
      await this._postRepository.getComments(
        thread.map((post) => post.id),
        orgId
      )
    );
  }

  private async previewThread(postId: string, orgId?: string) {
    const thread = await this.getPostsRecursively(postId, false, orgId, true);
    if (!thread.length) throw new HttpException('Post not found', 404);
    return thread;
  }

  async resolvePreviewPlacement(
    rootId: string,
    input: CommentPlacementInput = {},
    orgId?: string
  ): Promise<CommentPlacement> {
    const thread = await this.previewThread(rootId, orgId);
    const target = thread.find((post) => post.id === (input.postId || rootId));
    if (!target) throw new BadRequestException('Post is outside preview');
    const hasAnchor =
      input.anchorStart !== undefined ||
      input.anchorEnd !== undefined ||
      input.anchorQuote !== undefined;
    if (input.parentId) {
      if (hasAnchor)
        throw new BadRequestException('Replies cannot have anchors');
      const parent = await this._postRepository.getCommentForReply(
        input.parentId
      );
      if (
        !parent ||
        parent.parentId ||
        parent.resolvedAt ||
        parent.kind !== 'COMMENT' ||
        !thread.some((post) => post.id === parent.postId) ||
        (input.postId && input.postId !== parent.postId)
      ) {
        throw new BadRequestException('Invalid reply');
      }
      return { postId: parent.postId, parentId: input.parentId };
    }
    if (hasAnchor) {
      if (
        !Number.isInteger(input.anchorStart) ||
        !Number.isInteger(input.anchorEnd) ||
        typeof input.anchorQuote !== 'string' ||
        input.anchorQuote.length > 500
      )
        throw new BadRequestException('Invalid anchor');
      assertAnchorMatches(
        target.content,
        input.anchorStart!,
        input.anchorEnd!,
        input.anchorQuote
      );
      return {
        postId: target.id,
        anchorStart: input.anchorStart,
        anchorEnd: input.anchorEnd,
        anchorQuote: input.anchorQuote,
      };
    }
    return { postId: target.id };
  }

  async createAnonymousComment(
    rootId: string,
    body: CreateAnonymousCommentDto,
    ip: string | null,
    userAgent: string | null
  ) {
    if (!isAnonymousPreviewCommentEnabled())
      throw new HttpException('Not found', 404);
    const ipKey = createHash('sha256')
      .update(ip || 'unknown')
      .digest('hex');
    await consumeRateLimit(`preview-comments:ip:${ipKey}`, 20, 3600);
    await consumeRateLimit(`preview-comments:post:${rootId}:${ipKey}`, 10, 300);
    const thread = await this.previewThread(rootId);
    const content = sanitizeCommentContent(body.content);
    const name = sanitizeCommentName(body.displayName);
    if (!content || !name)
      throw new BadRequestException('Name and comment required');
    if (!(await verifyRecaptchaToken(body.recaptchaToken)))
      throw new BadRequestException('Invalid captcha');
    const placement = await this.resolvePreviewPlacement(
      rootId,
      body,
      thread[0].organizationId
    );
    return this._postRepository.createComment(
      thread[0].organizationId,
      null,
      placement.postId,
      content,
      'COMMENT',
      {
        ...placement,
        guestName: name,
        guestIp: ip?.slice(0, 64),
        guestUserAgent: userAgent?.slice(0, 500),
      }
    );
  }

  private async assertCommentAccess(
    orgId: string,
    rootId: string,
    commentId: string,
    requireProfileId?: string | null
  ) {
    await this.assertPostReviewAccess(orgId, rootId, requireProfileId);
    const comment = await this._postRepository.getCommentScope(
      commentId,
      orgId
    );
    if (!comment || comment.post.deletedAt)
      throw new HttpException('Comment not found', 404);
    if (
      requireProfileId !== undefined &&
      comment.post.profileId !== requireProfileId
    )
      throw new HttpException('Post is not in your profile', 403);
    const thread = await this.previewThread(rootId, orgId);
    if (!thread.some((post) => post.id === comment.postId))
      throw new HttpException('Comment not found', 404);
    return comment;
  }

  async resolveComment(
    orgId: string,
    rootId: string,
    commentId: string,
    resolved: boolean,
    requireProfileId?: string | null
  ) {
    const comment = await this.assertCommentAccess(
      orgId,
      rootId,
      commentId,
      requireProfileId
    );
    if (comment.parentId || comment.kind !== 'COMMENT')
      throw new BadRequestException(
        'Only comment conversations can be resolved'
      );
    await this._postRepository.setCommentResolved(
      commentId,
      orgId,
      resolved ? new Date() : null
    );
    return { success: true };
  }

  async deletePreviewComment(
    orgId: string,
    rootId: string,
    commentId: string,
    requireProfileId?: string | null
  ) {
    await this.assertCommentAccess(orgId, rootId, commentId, requireProfileId);
    await this._postRepository.softDeleteComment(commentId, orgId);
    return { success: true };
  }

  // Valida que o post pertence a org e, para membro restrito (org-USER), que
  // esta no perfil dele — impede revisar/ler comentarios de outro perfil.
  private async assertPostReviewAccess(
    orgId: string,
    postId: string,
    requireProfileId?: string | null
  ) {
    const post = await this._postRepository.getPostProfileScope(orgId, postId);
    if (!post) {
      throw new HttpException('Post not found', 404);
    }
    if (requireProfileId !== undefined && post.profileId !== requireProfileId) {
      throw new HttpException('Post is not in your profile', 403);
    }
  }

  async createReview(
    orgId: string,
    userId: string,
    postId: string,
    params: {
      kind: CommentKind;
      content: string;
      requireProfileId?: string | null;
      placement?: CommentPlacementInput;
    }
  ) {
    await this.assertPostReviewAccess(orgId, postId, params.requireProfileId);
    if (params.kind === 'COMMENT' && !params.content?.trim()) {
      throw new HttpException('Comment is required', 400);
    }
    if (!['COMMENT', 'APPROVAL', 'CHANGE_REQUEST'].includes(params.kind))
      throw new BadRequestException('Invalid review kind');
    if (params.kind !== 'COMMENT' && hasPlacement(params.placement))
      throw new BadRequestException('Only comments accept placement');
    const content = sanitizeCommentContent(params.content);
    if (params.kind === 'COMMENT' && !content)
      throw new BadRequestException('Comment required');
    if (hasPlacement(params.placement)) {
      const placement = await this.resolvePreviewPlacement(
        postId,
        params.placement,
        orgId
      );
      return this._postRepository.createComment(
        orgId,
        userId,
        placement.postId,
        content,
        params.kind,
        placement
      );
    }
    return this._postRepository.createComment(
      orgId,
      userId,
      postId,
      content,
      params.kind
    );
  }

  getTags(orgId: string, profileId?: string) {
    return this._postRepository.getTags(orgId, profileId);
  }

  createTag(orgId: string, body: CreateTagDto, profileId?: string) {
    return this._postRepository.createTag(orgId, body, profileId);
  }

  editTag(id: string, orgId: string, body: CreateTagDto, profileId?: string) {
    return this._postRepository.editTag(id, orgId, body, profileId);
  }

  deleteTag(id: string, orgId: string, profileId?: string) {
    return this._postRepository.deleteTag(id, orgId, profileId);
  }

  createComment(
    orgId: string,
    userId: string,
    postId: string,
    comment: string
  ) {
    return this._postRepository.createComment(orgId, userId, postId, comment);
  }
}
