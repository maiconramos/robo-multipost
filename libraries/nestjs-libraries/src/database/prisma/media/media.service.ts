import { HttpException, Injectable, Logger } from '@nestjs/common';
import {
  MediaRepository,
  MediaUsageCandidate,
} from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@gitroom/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import {
  AiAspectRatio,
  AiImageService,
  ImageMode,
} from '@gitroom/nestjs-libraries/ai/ai-image.service';
import { AiTextService } from '@gitroom/nestjs-libraries/ai/ai-text.service';
import {
  AiVideoService,
  GenerateVideoInput,
} from '@gitroom/nestjs-libraries/ai/ai-video.service';

/**
 * Por que uma mídia não pôde ser excluída:
 * - `pending_posts`: referenciada por post que ainda vai publicar (QUEUE,
 *   DRAFT ou ERROR), seja em `image` ou como thumbnail no `settings`;
 * - `avatar`: é foto de perfil, logo de agência ou ícone de app OAuth;
 * - `thumbnail_of_other_media`: o arquivo é a thumbnail de outra mídia viva.
 */
export type MediaDeleteBlockReason =
  | 'pending_posts'
  | 'avatar'
  | 'thumbnail_of_other_media';

export interface MediaDeleteBlocked {
  id: string;
  name: string;
  reason: MediaDeleteBlockReason;
  posts: number;
}

export interface MediaDeleteResult {
  deleted: string[];
  blocked: MediaDeleteBlocked[];
  failed: { id: string; name: string }[];
}

@Injectable()
export class MediaService {
  private readonly _logger = new Logger(MediaService.name);
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager,
    private _aiImageService: AiImageService,
    private _aiTextService: AiTextService,
    private _aiVideoService: AiVideoService
  ) {}

  async deleteMedia(org: string, id: string, profileId?: string) {
    // Exclusão individual e em massa compartilham as mesmas travas e a mesma
    // remoção do bucket — "apagar" precisa significar a mesma coisa nos dois.
    return this.deleteMediaBulk(org, [id], profileId);
  }

  /**
   * Exclui mídia liberando espaço no bucket: remove o arquivo (e a thumbnail
   * órfã, que é gravada com `preventSave` e não tem linha em Media) e só então
   * marca `deletedAt`.
   *
   * A ordem importa: se a remoção no storage falhar, a linha permanece viva e
   * o item entra em `failed` — nunca marcamos como apagada uma mídia cujo
   * arquivo continua ocupando espaço.
   */
  async deleteMediaBulk(
    org: string,
    ids: string[],
    profileId?: string
  ): Promise<MediaDeleteResult> {
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    const empty: MediaDeleteResult = { deleted: [], blocked: [], failed: [] };
    if (!uniqueIds.length) {
      return empty;
    }

    const candidates = await this._mediaRepository.getMediaForDeletion(
      org,
      uniqueIds,
      profileId
    );
    if (!candidates.length) {
      return empty;
    }

    const candidateIds = candidates.map((media) => media.id);
    const candidatePaths = [
      ...new Set(
        candidates
          .flatMap((media) => [media.path, media.thumbnail])
          .filter((path): path is string => !!path)
      ),
    ];

    const [pendingPosts, referencingMedia] = await Promise.all([
      this._mediaRepository.findPendingPostsUsingMedia(org, candidateIds),
      this._mediaRepository.findMediaReferencingPaths(
        candidatePaths,
        candidateIds
      ),
    ]);

    const postsByMedia = this.countPendingPostsByMedia(
      pendingPosts,
      candidateIds
    );

    // Arquivos que outra mídia viva ainda exibe: não podem sair do bucket.
    const stillReferenced = new Set<string>();
    const usedAsThumbnail = new Set<string>();
    for (const other of referencingMedia) {
      if (other.path) {
        stillReferenced.add(other.path);
      }
      if (other.thumbnail) {
        stillReferenced.add(other.thumbnail);
        usedAsThumbnail.add(other.thumbnail);
      }
    }

    const result: MediaDeleteResult = { deleted: [], blocked: [], failed: [] };

    for (const media of candidates) {
      const blockReason = this.resolveBlockReason(
        media,
        postsByMedia.get(media.id) ?? 0,
        usedAsThumbnail
      );

      if (blockReason) {
        result.blocked.push({
          id: media.id,
          name: media.name,
          reason: blockReason,
          posts: postsByMedia.get(media.id) ?? 0,
        });
        continue;
      }

      const files = [
        ...new Set(
          [media.path, media.thumbnail].filter(
            (path): path is string => !!path && !stillReferenced.has(path)
          )
        ),
      ];

      try {
        for (const file of files) {
          await this.storage.removeFile(file);
        }
        result.deleted.push(media.id);
      } catch (err) {
        this._logger.error(
          `Falha ao remover do storage a midia ${media.id}: ${
            (err as Error).message
          }`
        );
        result.failed.push({ id: media.id, name: media.name });
      }
    }

    if (result.deleted.length) {
      await this._mediaRepository.deleteMediaBulk(
        org,
        result.deleted,
        profileId
      );
    }

    return result;
  }

  private resolveBlockReason(
    media: MediaUsageCandidate,
    pendingPosts: number,
    usedAsThumbnail: Set<string>
  ): MediaDeleteBlockReason | null {
    if (pendingPosts > 0) {
      return 'pending_posts';
    }
    if (media.usedAsAvatar) {
      return 'avatar';
    }
    if (usedAsThumbnail.has(media.path)) {
      return 'thumbnail_of_other_media';
    }
    return null;
  }

  /**
   * Conta, por mídia, quantos posts pendentes a referenciam. A busca no banco
   * já filtrou por `contains`; aqui só distribuímos o resultado por id, olhando
   * `image` e `settings` (thumbnail do YouTube).
   */
  private countPendingPostsByMedia(
    posts: { image: string | null; settings: string | null }[],
    ids: string[]
  ) {
    const counts = new Map<string, number>(ids.map((id) => [id, 0]));

    for (const post of posts) {
      const haystack = `${post.image ?? ''}${post.settings ?? ''}`;
      for (const id of ids) {
        if (haystack.includes(id)) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }

    return counts;
  }

  getMediaById(id: string) {
    return this._mediaRepository.getMediaById(id);
  }

  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean,
    profileId?: string,
    aspectRatio?: AiAspectRatio,
    extra?: { mode?: ImageMode; referenceImageUrl?: string }
  ) {
    const generating = await this._subscriptionService.useCredit(
      org,
      'ai_images',
      async () => {
        let finalPrompt = prompt;
        // Enrichment do prompt e best-effort: se a credencial de TEXT
        // nao estiver configurada (412), seguimos com o prompt original.
        // Sem isso, configurar so IMAGE em Settings > AI Models quebrava
        // a geracao com erro 412 mesmo a chave de imagem estando OK.
        if (generatePromptFirst) {
          try {
            finalPrompt = await this._aiTextService.generatePromptForPicture(
              org.id,
              prompt,
              profileId
            );
          } catch (e) {
            const status =
              e instanceof HttpException ? e.getStatus() : undefined;
            if (status === 412) {
              this._logger.warn(
                'TEXT credential nao configurada, seguindo com prompt original sem enrichment'
              );
            } else {
              throw e;
            }
          }
        }
        try {
          const result = await this._aiImageService.generate(
            org.id,
            finalPrompt,
            profileId,
            {
              ...(aspectRatio ? { aspectRatio } : {}),
              ...(extra?.mode ? { mode: extra.mode } : {}),
              ...(extra?.referenceImageUrl
                ? { referenceImageUrl: extra.referenceImageUrl }
                : {}),
            }
          );
          return result.base64;
        } catch (err) {
          const status =
            err instanceof HttpException ? err.getStatus() : 'n/a';
          this._logger.error(
            `generateImage falhou: mode=${extra?.mode ?? 'T2I'} aspect=${aspectRatio ?? '(default)'} hasRef=${extra?.referenceImageUrl ? 'y' : 'n'} status=${status} msg=${(err as Error).message}`
          );
          throw err;
        }
      }
    );

    return generating;
  }

  saveFile(org: string, fileName: string, filePath: string, originalName?: string, profileId?: string) {
    return this._mediaRepository.saveFile(org, fileName, filePath, originalName, profileId);
  }

  /**
   * Lista a biblioteca marcando `inUse`: a grade precisa mostrar o cadeado
   * ANTES do usuário selecionar em massa, senão ele seleciona 20 itens e
   * descobre no final que metade está travada.
   */
  async getMedia(org: string, page: number, profileId?: string) {
    const media = await this._mediaRepository.getMedia(org, page, profileId);
    const ids = media.results.map((item) => item.id);
    const pendingPosts = await this._mediaRepository.findPendingPostsUsingMedia(
      org,
      ids
    );
    const postsByMedia = this.countPendingPostsByMedia(pendingPosts, ids);

    return {
      ...media,
      // `usedAsAvatar` fica de fora do payload: o objeto devolvido aqui e
      // gravado inteiro dentro de `Post.image` quando o usuario insere a midia
      // num post — quanto menos campo transitorio vazar para la, melhor.
      results: media.results.map(({ usedAsAvatar, ...item }) => ({
        ...item,
        inUse: (postsByMedia.get(item.id) ?? 0) > 0 || usedAsAvatar,
      })),
    };
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing && process.env.STRIPE_PUBLISHABLE_KEY) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    const totalCredits = await this._subscriptionService.checkCredits(
      org,
      'ai_videos'
    );

    if (totalCredits.credits <= 0) {
      throw new SubscriptionException({
        action: AuthorizationActions.Create,
        section: Sections.VIDEOS_PER_MONTH,
      });
    }

    const video = this._videoManager.getVideoByName(body.type);
    if (!video) {
      throw new Error(`Video type ${body.type} not found`);
    }

    if (!video.trial && org.isTrailing && process.env.STRIPE_PUBLISHABLE_KEY) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    console.log(body.customParams);
    await video.instance.processAndValidate(body.customParams);
    console.log('no err');

    return await this._subscriptionService.useCredit(
      org,
      'ai_videos',
      async () => {
        const loadedData = await video.instance.process(
          body.output,
          body.customParams
        );

        const file = await this.storage.uploadSimple(loadedData);
        return this.saveFile(org.id, file.split('/').pop(), file);
      }
    );
  }

  /**
   * Geracao de video via Kie.ai (Seedance/Veo) — fluxo novo do AI Provider
   * System. Diferente de `generateVideo()` que usa o VideoManager legado
   * (HeyGen, ImagesSlides etc), este metodo:
   *  - Resolve credencial via AiVideoService (provider=kieai, modelo
   *    escolhido em Settings).
   *  - Usa polling de 30s (max 10min) — bloqueia a request, mas e a melhor
   *    opcao MVP sem expor webhook publico.
   *  - Faz uploadSimple do URL hospedado pelo kie.ai para storage propria
   *    (R2/local) imediatamente para evitar expirar.
   *  - Decrementa credito ai_videos via useCredit.
   *
   * Reusado pelo controller `/ai/video/generate` e pelo MCP tool
   * `generateVideoTool` do agente.
   */
  async generateAiVideo(
    org: Organization,
    input: GenerateVideoInput,
    profileId?: string
  ) {
    return this._subscriptionService.useCredit(
      org,
      'ai_videos',
      async () => {
        const generated = await this._aiVideoService.generate(
          org.id,
          input,
          profileId
        );

        const file = await this.storage.uploadSimple(generated.url);
        if (!file) {
          throw new HttpException(
            'Falha ao baixar video do kie.ai para storage proprio.',
            502
          );
        }

        const fileName = file.split('/').pop() ?? 'video.mp4';
        return this.saveFile(org.id, fileName, file, undefined, profileId);
      },
      profileId
    );
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
