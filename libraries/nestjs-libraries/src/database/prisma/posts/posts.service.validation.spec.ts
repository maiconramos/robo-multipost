jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkServiceMock {},
}));

import { BadRequestException } from '@nestjs/common';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from './posts.service';

const makeBody = (shortLink: boolean | string) => ({
  type: 'now',
  shortLink,
  date: '2026-09-03T12:00:00.000Z',
  tags: [] as Array<{ value: string; label: string }>,
  posts: [
    {
      integration: { id: 'int-1' },
      value: [
        {
          content: '<p>Teste</p>',
          delay: 0,
          image: [] as Array<{ id: string; path: string }>,
        },
      ],
      settings: { post_type: 'post' },
    },
  ],
});

const buildService = () => {
  const integrationService = createMock<IntegrationService>();
  integrationService.getIntegrationById.mockResolvedValue({
    id: 'int-1',
    providerIdentifier: 'instagram',
  } as any);

  return new PostsService(
    null as any,
    null as any,
    integrationService,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    {} as any,
    {} as any
  );
};

describe('PostsService.mapTypeToPost - tipos estritos', () => {
  it('aceita booleano real no contrato de criacao', async () => {
    const result = await buildService().mapTypeToPost(
      makeBody(false) as any,
      'org-1'
    );

    expect(result.shortLink).toBe(false);
  });

  it('rejeita string que antes era convertida implicitamente para booleano', async () => {
    await expect(
      buildService().mapTypeToPost(makeBody('false') as any, 'org-1')
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
