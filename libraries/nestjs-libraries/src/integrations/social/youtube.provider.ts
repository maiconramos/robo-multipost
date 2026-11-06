import { DashboardFunction } from '@gitroom/nestjs-libraries/integrations/dashboard.function.decorator';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import {
  AnalyticsData,
  AuthTokenDetails,
  ClientInformation,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { google, youtube_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library/build/src/auth/oauth2client';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import {
  BadBody,
  SocialAbstract,
  RefreshToken,
  PublishedWithError,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import * as process from 'node:process';
import dayjs from 'dayjs';
import { GaxiosResponse } from 'gaxios/build/src/common';
import Schema$Video = youtube_v3.Schema$Video;
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { timer } from '@gitroom/helpers/utils/timer';

const THUMBNAIL_PROCESSING_TIMEOUT_MS = 120_000;
const THUMBNAIL_PROCESSING_POLL_MS = 5_000;
const THUMBNAIL_PROCESSING_REQUEST_TIMEOUT_MS = 10_000;

const clientAndYoutube = (clientInformation?: ClientInformation) => {
  const client = new google.auth.OAuth2({
    clientId: clientInformation?.client_id || process.env.YOUTUBE_CLIENT_ID,
    clientSecret:
      clientInformation?.client_secret || process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri: `${process.env.FRONTEND_URL}/integrations/social/youtube`,
  });

  const youtube = (newClient: OAuth2Client) =>
    google.youtube({
      version: 'v3',
      auth: newClient,
    });

  const youtubeAnalytics = (newClient: OAuth2Client) =>
    google.youtubeAnalytics({
      version: 'v2',
      auth: newClient,
    });

  const oauth2 = (newClient: OAuth2Client) =>
    google.oauth2({
      version: 'v2',
      auth: newClient,
    });

  return { client, youtube, oauth2, youtubeAnalytics };
};

@Rules('YouTube must have on video attachment, it cannot be empty')
export class YoutubeProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 200; // YouTube has strict upload quotas
  identifier = 'youtube';
  name = 'YouTube';
  isBetweenSteps = true;
  keepReconnectAuthTokens = true;
  dto = YoutubeSettingsDto;
  scopes = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.force-ssl',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtubepartner',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ];

  editor = 'normal' as const;
  maxLength() {
    return 5000;
  }

  override handleErrors(body: string):
    | {
        type: 'refresh-token' | 'bad-body';
        value: string;
      }
    | undefined {
    if (body.includes('invalidTitle')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but we could not set the title. Title is too long.',
      };
    }

    if (body.includes('failedPrecondition')) {
      return {
        type: 'bad-body',
        value:
          'We have uploaded your video but we could not set the thumbnail. Thumbnail size is too large.',
      };
    }

    // Cota diaria de insercao de video do projeto Google (upstream #2294):
    // nao e problema do video, reagendar resolve.
    if (body.includes('defaultVideoInsertPerDayPerProject')) {
      return {
        type: 'bad-body',
        value:
          "YouTube's daily upload quota is exhausted for today, please reschedule this post for a later time.",
      };
    }

    if (body.includes('uploadLimitExceeded')) {
      return {
        type: 'bad-body',
        value:
          'You have reached your daily upload limit, please try again tomorrow.',
      };
    }

    if (body.includes('youtubeSignupRequired')) {
      return {
        type: 'bad-body',
        value:
          'You have to link your youtube account to your google account first.',
      };
    }

    if (body.includes('youtube.thumbnail')) {
      return {
        type: 'bad-body',
        value:
          "Your video was uploaded to YouTube successfully, but we could not set the thumbnail: custom thumbnails require a phone-verified YouTube channel. Verify your channel at youtube.com/verify, and set this video's thumbnail manually in YouTube Studio.",
      };
    }

    if (body.includes('Unauthorized')) {
      return {
        type: 'refresh-token',
        value:
          'Token expired or invalid, please reconnect your YouTube account.',
      };
    }

    if (body.includes('UNAUTHENTICATED') || body.includes('invalid_grant')) {
      return {
        type: 'refresh-token',
        value: 'Please re-authenticate your YouTube account',
      };
    }

    return undefined;
  }

  async refreshToken(
    refresh_token: string,
    clientInformation?: ClientInformation
  ): Promise<AuthTokenDetails> {
    // Passar clientInformation aqui e critico: o refresh_token foi emitido
    // pelo OAuth client do workspace (Settings > Credenciais > YouTube),
    // entao o refresh tem que usar o MESMO client_id/client_secret. Caso
    // contrario o Google retorna invalid_grant e o orchestrator marca a
    // integracao como `refreshNeeded` num loop infinito (usuario reconecta,
    // proximo cron quebra de novo). Sintoma anterior: refreshToken="" no
    // banco e mensagem "you need to reconnect" repetindo a cada hora.
    const { client, oauth2 } = clientAndYoutube(clientInformation);
    client.setCredentials({ refresh_token });
    const { credentials } = await client.refreshAccessToken();
    const user = oauth2(client);
    const expiryDate = new Date(credentials.expiry_date!);
    const unixTimestamp =
      Math.floor(expiryDate.getTime() / 1000) -
      Math.floor(new Date().getTime() / 1000);

    const { data } = await user.userinfo.get();

    return {
      accessToken: credentials.access_token!,
      expiresIn: unixTimestamp!,
      refreshToken: credentials.refresh_token ?? refresh_token,
      id: data.id!,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  async generateAuthUrl(clientInformation?: ClientInformation) {
    const state = makeSecureId(7);
    const { client } = clientAndYoutube(clientInformation);
    return {
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        // Sem isso o Google pode pular a tela de consent quando a conta ja
        // autorizou o app, e nao emitir refresh_token novo.
        include_granted_scopes: false,
        state,
        redirect_uri: `${process.env.FRONTEND_URL}/integrations/social/youtube`,
        scope: this.scopes.slice(0),
      }),
      codeVerifier: makeSecureId(11),
      state,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    // POST https://oauth2.googleapis.com/revoke?token={token}
    // Aceita access_token ou refresh_token. Se o token ja estiver expirado,
    // a chamada pode falhar — ignoramos silenciosamente porque o
    // include_granted_scopes=false + prompt=consent ja forcam novo refresh.
    try {
      await this.getSsrfSafeAxios().post(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(
          accessToken
        )}`,
        null,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    } catch {
      // ignore
    }
  }

  async authenticate(
    params: {
      code: string;
      codeVerifier: string;
      refresh?: string;
    },
    clientInformation?: ClientInformation
  ) {
    const { client, oauth2 } = clientAndYoutube(clientInformation);
    const { tokens } = await client.getToken(params.code);
    client.setCredentials(tokens);
    const { scopes } = await client.getTokenInfo(tokens.access_token!);
    this.checkScopes(this.scopes, scopes);

    const user = oauth2(client);
    const { data } = await user.userinfo.get();

    const expiryDate = new Date(tokens.expiry_date!);
    const unixTimestamp =
      Math.floor(expiryDate.getTime() / 1000) -
      Math.floor(new Date().getTime() / 1000);

    return {
      accessToken: tokens.access_token!,
      expiresIn: unixTimestamp,
      refreshToken: tokens.refresh_token!,
      id: data.id!,
      name: data.name!,
      picture: data?.picture || '',
      username: '',
    };
  }

  @DashboardFunction()
  async pages(accessToken: string) {
    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    try {
      // Get all channels the user has access to
      const response = await youtubeClient.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        mine: true,
      });

      const channels = response.data.items || [];

      return channels.map((channel) => ({
        id: channel.id!,
        name: channel.snippet?.title || 'Unnamed Channel',
        picture: {
          data: {
            url: channel.snippet?.thumbnails?.default?.url || '',
          },
        },
        username: channel.snippet?.customUrl || '',
        subscriberCount: channel.statistics?.subscriberCount || '0',
      }));
    } catch (error) {
      console.error('Failed to fetch YouTube channels:', error);
      return [];
    }
  }

  async fetchPageInformation(accessToken: string, data: { id: string }) {
    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    try {
      const response = await youtubeClient.channels.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: [data.id],
      });

      const channel = response.data.items?.[0];

      if (!channel) {
        throw new Error('Channel not found');
      }

      return {
        id: channel.id!,
        name: channel.snippet?.title || 'Unnamed Channel',
        access_token: accessToken,
        picture: channel.snippet?.thumbnails?.default?.url || '',
        username: channel.snippet?.customUrl || '',
      };
    } catch (error) {
      console.error('Failed to fetch YouTube channel information:', error);
      throw error;
    }
  }

  // A politica de sessao do Google Workspace (invalid_rapt) derruba o refresh
  // de tempos em tempos; o motivo vira orientacao para o admin (upstream #1884)
  refreshErrorMessage(err: any): string | undefined {
    const data = err?.response?.data || {};
    const text = `${data.error_subtype || ''} ${data.error_description || ''} ${
      err?.message || ''
    }`;

    if (text.includes('invalid_rapt')) {
      return 'A política de sessão do Google Workspace da sua organização invalidou o acesso. Peça ao administrador do Google Workspace para marcar o Robô SanPost como app confiável e ativar "Isentar apps confiáveis" (https://support.google.com/a/answer/9368756) e reconecte o canal.';
    }

    return undefined;
  }

  async reConnect(
    id: string,
    requiredId: string,
    accessToken: string
  ): Promise<Omit<AuthTokenDetails, 'refreshToken' | 'expiresIn'>> {
    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });

    // direto no channels.list: pages() engole o erro real do Google e uma
    // lista vazia virava "canal nao encontrado" (upstream #1884)
    const { data } = await youtube(client).channels.list({
      part: ['id'],
      mine: true,
    });

    if (!(data.items || []).some((p) => p.id === requiredId)) {
      throw new Error('Channel not found');
    }

    const information = await this.fetchPageInformation(accessToken, {
      id: requiredId,
    });

    return {
      id: information.id,
      name: information.name,
      accessToken: information.access_token,
      picture: information.picture,
      username: information.username,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost, ...comments] = postDetails;

    const { client, youtube } = clientAndYoutube();
    client.setCredentials({ access_token: accessToken });
    const youtubeClient = youtube(client);

    const { settings }: { settings: YoutubeSettingsDto } = firstPost;

    const response = await this.getSsrfSafeAxios()({
      url: firstPost?.media?.[0]?.path,
      method: 'GET',
      responseType: 'stream',
    });

    const all: GaxiosResponse<Schema$Video> = await this.runInConcurrent(
      async () =>
        youtubeClient.videos.insert({
          part: ['id', 'snippet', 'status'],
          notifySubscribers: true,
          requestBody: {
            snippet: {
              title: settings.title,
              description: firstPost?.message,
              ...(settings?.tags?.length
                ? { tags: settings.tags.map((p) => p.label) }
                : {}),
            },
            status: {
              privacyStatus: settings.type,
              selfDeclaredMadeForKids:
                settings.selfDeclaredMadeForKids === 'yes',
            },
          },
          media: {
            body: response.data,
          },
        }),
      true
    );

    const videoId = all?.data?.id!;
    const releaseURL = `https://www.youtube.com/watch?v=${videoId}`;
    // a miniatura do proprio YouTube (posts antigos) vence; senao a capa
    // definida na midia do post (upstream #2285)
    const thumbnail =
      settings?.thumbnail?.path || firstPost?.media?.[0]?.thumbnail || '';

    if (thumbnail) {
      try {
        await this.waitForThumbnailProcessing(youtubeClient, videoId);
        await this.runInConcurrent(async () =>
          youtubeClient.thumbnails.set({
            videoId,
            media: {
              body: (
                await this.getSsrfSafeAxios()({
                  url: thumbnail,
                  method: 'GET',
                  responseType: 'stream',
                })
              ).data,
            },
          })
        );
      } catch (err: any) {
        // o video ja esta no ar: a miniatura recusada nao pode perder o id e a
        // URL (upstream 23beddcd). Aqui o upload e sincrono, entao nem token
        // recusado volta para a nova tentativa — repetir o post() subiria o
        // video de novo.
        throw new PublishedWithError(
          this.identifier,
          firstPost.id,
          videoId,
          releaseURL,
          // so mensagem mapeada pelo handleErrors; 'Unknown Error' (erro nao
          // mapeado, falha ao baixar a imagem) vira a explicacao generica
          err instanceof BadBody &&
          err.message &&
          err.message !== 'Unknown Error'
            ? err.message
            : 'Your video was uploaded to YouTube successfully, but we could not set the thumbnail. Set it manually in YouTube Studio.'
        );
      }
    }

    return [
      {
        id: firstPost.id,
        releaseURL,
        postId: videoId,
        status: 'success',
      },
    ];
  }

  private async waitForThumbnailProcessing(
    youtubeClient: youtube_v3.Youtube,
    videoId: string
  ): Promise<void> {
    // O aceite de thumbnails.set antes da geracao dos quadros pode alterar
    // somente a miniatura tradicional; o processamento do Short a substitui.
    const deadline = Date.now() + THUMBNAIL_PROCESSING_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const response: GaxiosResponse<youtube_v3.Schema$VideoListResponse> =
        await this.runInConcurrent(() =>
          youtubeClient.videos.list(
            { id: [videoId], part: ['processingDetails', 'status'] },
            {
              timeout: Math.min(
                THUMBNAIL_PROCESSING_REQUEST_TIMEOUT_MS,
                remaining
              ),
              retry: false,
            }
          )
        );
      if (Date.now() >= deadline) break;
      const video = response?.data?.items?.find((item) => item.id === videoId);
      const processing = video?.processingDetails;
      if (
        ['failed', 'terminated'].includes(processing?.processingStatus || '') ||
        ['failed', 'rejected', 'deleted'].includes(
          video?.status?.uploadStatus || ''
        )
      ) {
        throw new BadBody(
          this.identifier,
          '',
          {} as any,
          'Your video was uploaded to YouTube, but YouTube processing failed. Check the video in YouTube Studio before setting its thumbnail.'
        );
      }
      if (
        processing?.processingStatus === 'succeeded' &&
        processing.thumbnailsAvailability === 'available'
      ) {
        return;
      }
      const delay = Math.min(
        THUMBNAIL_PROCESSING_POLL_MS,
        deadline - Date.now()
      );
      if (delay > 0) await timer(delay);
    }
    throw new BadBody(
      this.identifier,
      '',
      {} as any,
      'Your video was uploaded to YouTube, but processing did not finish in time to set the thumbnail. Set it manually in YouTube Studio after processing finishes.'
    );
  }

  async analytics(
    id: string,
    accessToken: string,
    date: number
  ): Promise<AnalyticsData[]> {
    try {
      const endDate = dayjs().format('YYYY-MM-DD');
      const startDate = dayjs().subtract(date, 'day').format('YYYY-MM-DD');

      const { client, youtubeAnalytics } = clientAndYoutube();
      client.setCredentials({ access_token: accessToken });

      const youtubeClient = youtubeAnalytics(client);
      const { data } = await youtubeClient.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics:
          'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,likes,subscribersLost',
        dimensions: 'day',
        sort: 'day',
      });

      const columns = data?.columnHeaders?.map((p) => p.name)!;
      const mappedData = data?.rows?.map((p) => {
        return columns.reduce((acc, curr, index) => {
          acc[curr!] = p[index];
          return acc;
        }, {} as any);
      });

      const acc = [] as any[];
      acc.push({
        label: 'Estimated Minutes Watched',
        data: mappedData?.map((p: any) => ({
          total: p.estimatedMinutesWatched,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Average View Duration',
        average: true,
        data: mappedData?.map((p: any) => ({
          total: p.averageViewDuration,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Average View Percentage',
        average: true,
        data: mappedData?.map((p: any) => ({
          total: p.averageViewPercentage,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Subscribers Gained',
        data: mappedData?.map((p: any) => ({
          total: p.subscribersGained,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Subscribers Lost',
        data: mappedData?.map((p: any) => ({
          total: p.subscribersLost,
          date: p.day,
        })),
      });

      acc.push({
        label: 'Likes',
        data: mappedData?.map((p: any) => ({
          total: p.likes,
          date: p.day,
        })),
      });

      return acc;
    } catch (err) {
      console.error('Error fetching YouTube analytics:', err);
      return [];
    }
  }

  async postAnalytics(
    integrationId: string,
    accessToken: string,
    postId: string,
    date: number
  ): Promise<AnalyticsData[]> {
    const today = dayjs().format('YYYY-MM-DD');

    try {
      const { client, youtube } = clientAndYoutube();
      client.setCredentials({ access_token: accessToken });
      const youtubeClient = youtube(client);

      // Fetch video statistics
      const response = await youtubeClient.videos.list({
        part: ['statistics', 'snippet'],
        id: [postId],
      });

      const video = response.data.items?.[0];

      if (!video || !video.statistics) {
        return [];
      }

      const stats = video.statistics;
      const result: AnalyticsData[] = [];

      if (stats.viewCount !== undefined) {
        result.push({
          label: 'Views',
          percentageChange: 0,
          data: [{ total: String(stats.viewCount), date: today }],
        });
      }

      if (stats.likeCount !== undefined) {
        result.push({
          label: 'Likes',
          percentageChange: 0,
          data: [{ total: String(stats.likeCount), date: today }],
        });
      }

      if (stats.commentCount !== undefined) {
        result.push({
          label: 'Comments',
          percentageChange: 0,
          data: [{ total: String(stats.commentCount), date: today }],
        });
      }

      if (stats.favoriteCount !== undefined) {
        result.push({
          label: 'Favorites',
          percentageChange: 0,
          data: [{ total: String(stats.favoriteCount), date: today }],
        });
      }

      return result;
    } catch (err: any) {
      // token expirado/revogado: checkPostAnalytics renova e tenta de novo uma
      // vez (upstream 96b78476)
      if (err?.response?.status === 401) {
        throw new RefreshToken(
          this.identifier,
          JSON.stringify(err.response.data || {}),
          '{}'
        );
      }
      console.error(
        'Error fetching YouTube post analytics:',
        summarizeError(err)
      );
      return [];
    }
  }
}
