// MediaService importa SubscriptionService que cascateia ate nostr-tools
// (ESM-only que quebra ts-jest). Mockamos topo-de-modulo as cadeias pesadas.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/videos/video.manager',
  () => ({ VideoManager: class VideoManagerMock {} })
);
jest.mock(
  '@gitroom/backend/services/auth/permissions/permission.exception.class',
  () => ({
    AuthorizationActions: { Create: 'Create' },
    Sections: { VIDEOS_PER_MONTH: 'VIDEOS_PER_MONTH' },
    SubscriptionException: class SubscriptionExceptionMock extends Error {},
  })
);
const mockStorage = { uploadSimple: jest.fn() };
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => mockStorage },
}));

import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { AiVideoService } from '@gitroom/nestjs-libraries/ai/ai-video.service';

const org = { id: 'org-video' } as any;
const input = { prompt: 'um gato', mode: 'T2V' } as any;

const build = () => {
  const repository = createMock<MediaRepository>();
  repository.saveFile.mockResolvedValue({ id: 'm-1' } as any);
  const subscription = {
    checkCreditsForProfile: jest.fn().mockResolvedValue({ credits: 3 }),
    useCredit: jest.fn(async (_o: any, _t: string, fn: () => any) => fn()),
  };
  const aiVideo = createMock<AiVideoService>();
  const service = new MediaService(
    repository,
    null as any,
    subscription as any,
    null as any,
    null as any,
    null as any,
    aiVideo
  );
  mockStorage.uploadSimple.mockResolvedValue('https://cdn/x/video.mp4');
  return { service, subscription, aiVideo };
};

describe('MediaService.generateAiVideo', () => {
  it('perfil sem creditos de video nao dispara job pago', async () => {
    const { service, subscription, aiVideo } = build();
    subscription.checkCreditsForProfile.mockResolvedValue({ credits: 0 });

    await expect(service.generateAiVideo(org, input, 'prof-0')).rejects.toMatchObject({ status: 429 });
    expect(subscription.checkCreditsForProfile).toHaveBeenCalledWith(org, 'ai_videos', 'prof-0');
    expect(aiVideo.generate).not.toHaveBeenCalled();
  });

  it('segunda geracao no mesmo perfil enquanto a primeira roda e recusada', async () => {
    const { service, aiVideo } = build();
    let finish!: (v: any) => void;
    aiVideo.generate.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    );

    const first = service.generateAiVideo(org, input, 'prof-lock');
    await new Promise((r) => setImmediate(r));

    await expect(service.generateAiVideo(org, input, 'prof-lock')).rejects.toMatchObject({ status: 429 });
    expect(aiVideo.generate).toHaveBeenCalledTimes(1);

    finish({ url: 'https://kie/x.mp4' });
    await expect(first).resolves.toEqual({ id: 'm-1' });
  });

  it('libera a trava quando a geracao termina (sucesso ou erro)', async () => {
    const { service, aiVideo } = build();
    aiVideo.generate.mockRejectedValueOnce(new Error('kie falhou'));

    await expect(service.generateAiVideo(org, input, 'prof-free')).rejects.toThrow('kie falhou');

    aiVideo.generate.mockResolvedValueOnce({ url: 'https://kie/x.mp4' } as any);
    await expect(service.generateAiVideo(org, input, 'prof-free')).resolves.toEqual({ id: 'm-1' });
  });

  it('perfis diferentes geram ao mesmo tempo', async () => {
    const { service, aiVideo } = build();
    let finish!: (v: any) => void;
    aiVideo.generate.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    );
    const first = service.generateAiVideo(org, input, 'prof-a');
    await new Promise((r) => setImmediate(r));

    aiVideo.generate.mockResolvedValueOnce({ url: 'https://kie/y.mp4' } as any);
    await expect(service.generateAiVideo(org, input, 'prof-b')).resolves.toEqual({ id: 'm-1' });

    finish({ url: 'https://kie/x.mp4' });
    await first;
  });
});
