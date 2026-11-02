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
    AuthorizationActions: { Create: 'Create', Delete: 'Delete', Update: 'Update' },
    Sections: { ADMIN: 'ADMIN', VIDEOS_PER_MONTH: 'VIDEOS_PER_MONTH' },
    SubscriptionException: class SubscriptionExceptionMock extends Error {
      constructor(public meta: any) { super('SubscriptionException'); }
    },
  })
);

const mockStorage = {
  uploadSimple: jest.fn(),
  uploadFile: jest.fn(),
  removeFile: jest.fn(),
  healthCheck: jest.fn(),
};
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => mockStorage },
}));

import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';

// Video gerado entra na biblioteca do perfil de quem gerou (chave de perfil
// ou membro), nao na da org inteira.
describe('MediaService.generateVideo', () => {
  it('salva o arquivo com o perfil e sem logar os parametros', async () => {
    const repository = createMock<MediaRepository>();
    repository.saveFile.mockResolvedValue({ id: 'm-1' } as any);
    const subscription = {
      checkCreditsForProfile: jest.fn().mockResolvedValue({ credits: 3 }),
      useCredit: jest.fn(async (_org: any, _type: string, fn: () => any) => fn()),
    };
    const instance = {
      processAndValidate: jest.fn().mockResolvedValue(undefined),
      process: jest.fn().mockResolvedValue('conteudo'),
    };
    const videoManager = {
      getVideoByName: jest.fn().mockReturnValue({ trial: true, instance }),
    };
    mockStorage.uploadSimple.mockResolvedValue('https://cdn.example.com/uploads/v.mp4');
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new MediaService(
      repository,
      null as any,
      subscription as any,
      videoManager as any,
      null as any,
      null as any,
      null as any
    );

    await service.generateVideo(
      { id: 'org-1' } as any,
      { type: 'slides', output: 'vertical', customParams: { voice: 'segredo' } } as any,
      'prof-1'
    );

    expect(repository.saveFile).toHaveBeenCalledWith(
      'org-1',
      'v.mp4',
      'https://cdn.example.com/uploads/v.mp4',
      undefined,
      'prof-1'
    );
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
