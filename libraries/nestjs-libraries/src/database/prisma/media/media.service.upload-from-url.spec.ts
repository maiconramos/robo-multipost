// MediaService importa SubscriptionService que cascateia ate nostr-tools
// (ESM-only que quebra ts-jest). Mockamos topo-de-modulo as cadeias pesadas.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/videos/video.manager', () => ({
  VideoManager: class VideoManagerMock {},
}));
jest.mock(
  '@gitroom/backend/services/auth/permissions/permission.exception.class',
  () => ({
    AuthorizationActions: {
      Create: 'Create',
      Delete: 'Delete',
      Update: 'Update',
    },
    Sections: { ADMIN: 'ADMIN', VIDEOS_PER_MONTH: 'VIDEOS_PER_MONTH' },
    SubscriptionException: class SubscriptionExceptionMock extends Error {
      constructor(public meta: any) {
        super('SubscriptionException');
      }
    },
  })
);

import { MediaService } from './media.service';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MediaRepository } from '@gitroom/nestjs-libraries/database/prisma/media/media.repository';

const buildService = (
  repo: ReturnType<typeof createMock<MediaRepository>>,
  uploadSimple: jest.Mock
) => {
  const service = new MediaService(
    repo,
    null as any, // openaiService legacy
    null as any, // subscriptionService
    null as any, // videoManager
    null as any, // aiImageService
    null as any, // aiTextService
    null as any // aiVideoService
  );
  // storage e um campo privado inicializado via UploadFactory; sobrescrevemos
  // na instancia para isolar o teste do storage real (R2/local).
  (service as any).storage = { uploadSimple };
  return service;
};

describe('MediaService.uploadFromUrl', () => {
  it('deve hospedar a URL via storage.uploadSimple e registrar via saveFile', async () => {
    const repo = createMock<MediaRepository>();
    repo.saveFile.mockResolvedValue({
      id: 'media-1',
      path: 'https://r2/u/photo.jpg',
    } as any);
    const uploadSimple = jest.fn().mockResolvedValue('https://r2/u/photo.jpg');

    const service = buildService(repo, uploadSimple);
    const result = await service.uploadFromUrl(
      'org-1',
      'https://externo/photo.jpg'
    );

    expect(uploadSimple).toHaveBeenCalledWith('https://externo/photo.jpg');
    // name inferido do ultimo segmento do path hospedado; originalName fica
    // undefined quando fileName nao e passado.
    expect(repo.saveFile).toHaveBeenCalledWith(
      'org-1',
      'photo.jpg',
      'https://r2/u/photo.jpg',
      undefined,
      undefined
    );
    expect(result).toEqual({ id: 'media-1', path: 'https://r2/u/photo.jpg' });
  });

  it('deve usar fileName fornecido como nome e originalName, e repassar profileId', async () => {
    const repo = createMock<MediaRepository>();
    repo.saveFile.mockResolvedValue({ id: 'm2', path: 'p' } as any);
    const uploadSimple = jest.fn().mockResolvedValue('https://r2/u/abc123');

    const service = buildService(repo, uploadSimple);
    await service.uploadFromUrl(
      'org-1',
      'https://externo/x',
      'custom.png',
      'profile-9'
    );

    expect(repo.saveFile).toHaveBeenCalledWith(
      'org-1',
      'custom.png',
      'https://r2/u/abc123',
      'custom.png',
      'profile-9'
    );
  });

  it('deve lancar 502 quando o storage nao consegue hospedar a midia', async () => {
    const repo = createMock<MediaRepository>();
    const uploadSimple = jest.fn().mockResolvedValue('');

    const service = buildService(repo, uploadSimple);

    await expect(
      service.uploadFromUrl('org-1', 'https://externo/quebrado')
    ).rejects.toMatchObject({ status: 502 });
    expect(repo.saveFile).not.toHaveBeenCalled();
  });
});
