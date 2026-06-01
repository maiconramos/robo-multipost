import { HttpException, Injectable, Logger } from '@nestjs/common';
import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { lookup } from 'mime-types';
import { Readable } from 'stream';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

export interface CarouselChannel {
  integrationId: string;
  caption: string;
}

export interface CarouselManifest {
  folder: string;
  date: string;
  type: 'draft' | 'schedule' | 'now';
  shortLink?: boolean;
  channels: CarouselChannel[];
}

interface ResolvedProfile {
  id: string;
  organization: { id: string };
}

@Injectable()
export class CarouselSchedulerService {
  private readonly _logger = new Logger(CarouselSchedulerService.name);
  private storage = UploadFactory.createStorage();

  constructor(
    private _profileService: ProfileService,
    private _postsService: PostsService,
    private _mediaService: MediaService,
    private _integrationService: IntegrationService
  ) {}

  async scheduleFromManifest(apiKey: string, manifest: CarouselManifest) {
    const profile = (await this._profileService.getProfileByApiKey(
      apiKey
    )) as ResolvedProfile | null;
    if (!profile) {
      throw new HttpException(
        'API key invalida (nenhum perfil encontrado)',
        401
      );
    }

    const orgId = profile.organization.id;
    const profileId = profile.id;

    if (!Array.isArray(manifest.channels) || manifest.channels.length === 0) {
      throw new HttpException(
        'Manifesto invalido: channels deve ser um array nao vazio',
        400
      );
    }
    if (!manifest.date || !manifest.type) {
      throw new HttpException(
        'Manifesto invalido: date e type sao obrigatorios',
        400
      );
    }
    if (
      manifest.channels.some(
        (channel) => !channel.integrationId || !channel.caption
      )
    ) {
      throw new HttpException(
        'Manifesto invalido: cada canal precisa de integrationId e caption',
        400
      );
    }

    const slidePaths = await this.readSlidePaths(manifest.folder);
    if (!slidePaths.length) {
      throw new HttpException('Nenhuma imagem encontrada na pasta', 400);
    }

    // Sobe cada slide NA ORDEM e coleta o path hospedado.
    const uploadedSlides: { path: string }[] = [];
    for (const slidePath of slidePaths) {
      const uploaded = await this.uploadLocalFile(orgId, slidePath, profileId);
      uploadedSlides.push({ path: uploaded.path });
    }

    const outputs: any[] = [];
    for (const channel of manifest.channels) {
      const integration = await this._integrationService.getIntegrationById(
        orgId,
        channel.integrationId
      );

      if (!integration) {
        throw new HttpException(
          `Integracao nao encontrada: ${channel.integrationId}`,
          404
        );
      }

      if (integration.profileId && integration.profileId !== profileId) {
        throw new HttpException(
          `Integracao ${channel.integrationId} nao pertence ao perfil da API key`,
          403
        );
      }

      const output = await this._postsService.createPost(
        orgId,
        {
          date: manifest.date,
          type: manifest.type,
          shortLink: manifest.shortLink,
          tags: [],
          posts: [
            {
              integration,
              group: makeId(10),
              settings: {
                __type: integration.providerIdentifier,
              },
              value: [
                {
                  content: channel.caption,
                  id: makeId(10),
                  delay: 0,
                  image: uploadedSlides.map((slide) => ({
                    id: makeId(10),
                    path: slide.path,
                  })),
                },
              ],
            },
          ],
        } as any,
        profileId
      );

      outputs.push(...output);
    }

    this._logger.log(
      `Carrossel agendado: ${slidePaths.length} slide(s) em ${manifest.channels.length} canal(is) para o perfil ${profileId}.`
    );

    return outputs;
  }

  private sortSlides(files: string[]): string[] {
    return [...files].sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true })
    );
  }

  private async readSlidePaths(folder: string): Promise<string[]> {
    const entries = await readdir(folder);
    const images = entries.filter((f) =>
      ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4'].includes(
        extname(f).toLowerCase()
      )
    );
    return this.sortSlides(images).map((f) => join(folder, f));
  }

  private async uploadLocalFile(
    org: string,
    filePath: string,
    profileId?: string
  ) {
    const buffer = await readFile(filePath);
    const originalname = filePath.split(/[\\/]/).pop() || 'slide';
    const mimetype = (lookup(filePath) || 'image/png') as string;
    const uploaded = await this.storage.uploadFile({
      buffer,
      mimetype,
      size: buffer.length,
      originalname,
      fieldname: '',
      encoding: '',
      destination: '',
      filename: '',
      path: '',
      stream: new Readable(),
    } as any);
    return this._mediaService.saveFile(
      org,
      uploaded.originalname,
      uploaded.path,
      undefined,
      profileId
    );
  }
}
