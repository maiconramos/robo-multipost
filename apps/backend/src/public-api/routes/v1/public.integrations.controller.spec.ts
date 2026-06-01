import { HttpException } from '@nestjs/common';

jest.mock('./public.integrations.controller', () => {
  const actual = jest.requireActual('./public.integrations.controller');
  return actual;
}, { virtual: false });

jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: jest.fn(),
  socialIntegrationList: [],
}));

jest.mock('nostr-tools', () => ({}));

import { PublicIntegrationsController } from './public.integrations.controller';

const makeIntegrationService = () => ({
  getIntegrationsList: jest.fn().mockResolvedValue([]),
});

describe('PublicIntegrationsController - listIntegration', () => {
  let controller: PublicIntegrationsController;
  let integrationService: ReturnType<typeof makeIntegrationService>;

  beforeEach(() => {
    integrationService = makeIntegrationService();
    controller = new PublicIntegrationsController(
      integrationService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('chave de perfil sem profileId: usa publicApiProfileId como filtro', async () => {
    await controller.listIntegration({ id: 'org-1' } as any, 'prof-1', undefined);

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith('org-1', 'prof-1');
  });

  it('chave de perfil com profileId igual: passa (200)', async () => {
    await controller.listIntegration({ id: 'org-1' } as any, 'prof-1', 'prof-1');

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith('org-1', 'prof-1');
  });

  it('chave de perfil com profileId diferente: lanca 403', async () => {
    await expect(
      controller.listIntegration({ id: 'org-1' } as any, 'prof-1', 'prof-OUTRO')
    ).rejects.toBeInstanceOf(HttpException);
    expect(integrationService.getIntegrationsList).not.toHaveBeenCalled();
  });

  it('chave de org sem profileId: retorna tudo (comportamento atual)', async () => {
    await controller.listIntegration({ id: 'org-1' } as any, undefined, undefined);

    expect(integrationService.getIntegrationsList).toHaveBeenCalledWith('org-1', undefined);
  });
});

describe('PublicIntegrationsController - uploadSimple', () => {
  let controller: PublicIntegrationsController;
  let mediaService: { saveFile: jest.Mock };

  beforeEach(() => {
    mediaService = {
      saveFile: jest
        .fn()
        .mockResolvedValue({ id: 'media-1', path: 'https://r2/slide.png' }),
    };
    controller = new PublicIntegrationsController(
      {} as any,
      {} as any,
      mediaService as any,
      {} as any,
      {} as any,
      {} as any
    );
    (controller as any).storage = {
      uploadFile: jest.fn().mockResolvedValue({
        originalname: 'slide.png',
        path: 'https://r2/slide.png',
      }),
    };
  });

  it('vincula a midia ao perfil e retorna id e path', async () => {
    const result = await controller.uploadSimple(
      { id: 'org-1' } as any,
      { originalname: 'slide.png' } as any,
      'profile-1'
    );

    expect(mediaService.saveFile).toHaveBeenCalledWith(
      'org-1',
      'slide.png',
      'https://r2/slide.png',
      undefined,
      'profile-1'
    );
    expect(result).toEqual({ id: 'media-1', path: 'https://r2/slide.png' });
  });
});

describe('PublicIntegrationsController - uploadsFromUrl', () => {
  let controller: PublicIntegrationsController;
  let mediaService: { uploadFromUrl: jest.Mock };

  beforeEach(() => {
    mediaService = {
      uploadFromUrl: jest
        .fn()
        .mockResolvedValue({ id: 'media-2', path: 'https://r2/x.jpg' }),
    };
    controller = new PublicIntegrationsController(
      {} as any,
      {} as any,
      mediaService as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('reusa MediaService.uploadFromUrl com profileId e retorna id e path', async () => {
    const result = await controller.uploadsFromUrl(
      { id: 'org-1' } as any,
      { url: 'https://ext/x.jpg' } as any,
      'profile-1'
    );

    expect(mediaService.uploadFromUrl).toHaveBeenCalledWith(
      'org-1',
      'https://ext/x.jpg',
      undefined,
      'profile-1'
    );
    expect(result).toEqual({ id: 'media-2', path: 'https://r2/x.jpg' });
  });
});
