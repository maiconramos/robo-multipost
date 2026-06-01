jest.mock('nostr-tools', () => ({
  getPublicKey: jest.fn(),
  Relay: jest.fn(),
  finalizeEvent: jest.fn(),
  SimplePool: jest.fn(),
}));

import { createMock } from '@gitroom/nestjs-libraries/test';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { CarouselSchedulerService } from './carousel.scheduler.service';

describe('CarouselSchedulerService', () => {
  let service: CarouselSchedulerService;
  let profileService: ReturnType<typeof createMock<ProfileService>>;
  let postsService: ReturnType<typeof createMock<PostsService>>;
  let mediaService: ReturnType<typeof createMock<MediaService>>;
  let integrationService: ReturnType<typeof createMock<IntegrationService>>;

  beforeEach(() => {
    profileService = createMock<ProfileService>();
    postsService = createMock<PostsService>();
    mediaService = createMock<MediaService>();
    integrationService = createMock<IntegrationService>();
    service = new CarouselSchedulerService(
      profileService,
      postsService,
      mediaService,
      integrationService
    );
  });

  describe('scheduleFromManifest', () => {
    it('rejeita quando a API key nao resolve nenhum perfil', async () => {
      profileService.getProfileByApiKey.mockResolvedValue(null as any);

      await expect(
        service.scheduleFromManifest('bad-key', {
          folder: '/x',
          date: '2026-06-02T13:00:00.000Z',
          type: 'schedule',
          channels: [],
        })
      ).rejects.toThrow('API key invalida');
    });
  });

  describe('sortSlides', () => {
    it('ordena numericamente respeitando numeros de mais de um digito', () => {
      const result = (service as any).sortSlides([
        'slide_10.png',
        'slide_02.png',
        'slide_01.png',
      ]);

      expect(result).toEqual(['slide_01.png', 'slide_02.png', 'slide_10.png']);
    });
  });

  describe('scheduleFromManifest (upload e agendamento)', () => {
    it('sobe slides na ordem e agenda um post por canal com legenda propria', async () => {
      profileService.getProfileByApiKey.mockResolvedValue({
        id: 'profile-1',
        organization: { id: 'org-1' },
      } as any);
      integrationService.getIntegrationById.mockResolvedValue({
        id: 'abc123',
        providerIdentifier: 'instagram',
        profileId: 'profile-1',
      } as any);
      postsService.createPost.mockResolvedValue([
        { postId: 'p', integration: 'i' },
      ] as any);

      jest
        .spyOn(service as any, 'readSlidePaths')
        .mockResolvedValue(['/slides/slide_01.png', '/slides/slide_02.png']);
      jest
        .spyOn(service as any, 'uploadLocalFile')
        .mockImplementation(async (...args: any[]) => {
          const p = args[1] as string;
          return { id: 'm-' + p, path: 'https://r2/' + p.split(/[\\/]/).pop() };
        });

      await service.scheduleFromManifest('key', {
        folder: '/slides',
        date: '2026-06-02T13:00:00.000Z',
        type: 'schedule',
        channels: [{ integrationId: 'abc123', caption: '<p>IG</p>' }],
      });

      expect(postsService.createPost.mock.calls[0][0]).toBe('org-1');
      expect(postsService.createPost.mock.calls[0][2]).toBe('profile-1');

      const body = postsService.createPost.mock.calls[0][1] as any;
      expect(body.posts[0].value[0].content).toBe('<p>IG</p>');
      expect(body.posts[0].value[0].image.map((i: any) => i.path)).toEqual([
        'https://r2/slide_01.png',
        'https://r2/slide_02.png',
      ]);
    });
  });
});
