jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);

import { HttpException } from '@nestjs/common';
import { GenerateVideoTool } from '../generate.video.tool';

const makeOptions = (org: any, profileId?: string) => ({
  requestContext: {
    get: (key: string) =>
      ((
        {
          organization: JSON.stringify(org),
          profileId,
        } as Record<string, unknown>
      )[key]),
  },
});

describe('GenerateVideoTool', () => {
  const mediaService = { generateAiVideo: jest.fn() };
  let tool: GenerateVideoTool;
  let exec: (input: any, options: any) => Promise<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new GenerateVideoTool(mediaService as any);
    exec = (tool.run() as any).execute;
  });

  it('aceita sucesso ou erro controlado no schema de saida', () => {
    const schema = (tool.run() as any).outputSchema;
    expect(
      schema.safeParse({
        id: 'media-1',
        path: 'https://cdn.example/video.mp4',
      }).success
    ).toBe(true);
    expect(schema.safeParse({ error: 'Falha controlada' }).success).toBe(true);
  });

  it('preserva profileId e devolve o arquivo quando a geracao conclui', async () => {
    mediaService.generateAiVideo.mockResolvedValue({
      id: 'media-1',
      path: 'https://cdn.example/video.mp4',
    });

    const result = await exec(
      {
        prompt: 'cidade futurista',
        mode: 'T2V',
        aspectRatio: '9:16',
      },
      makeOptions({ id: 'org-1' }, 'profile-1')
    );

    expect(mediaService.generateAiVideo).toHaveBeenCalledWith(
      { id: 'org-1' },
      expect.objectContaining({ prompt: 'cidade futurista', mode: 'T2V' }),
      'profile-1'
    );
    expect(result).toEqual({
      id: 'media-1',
      path: 'https://cdn.example/video.mp4',
    });
  });

  it('fecha a execucao com erro controlado quando o provider rejeita', async () => {
    mediaService.generateAiVideo.mockRejectedValue(
      new HttpException('Conteudo recusado pela moderacao do kie.ai.', 502)
    );

    const result = await exec(
      {
        prompt: 'cidade futurista',
        mode: 'T2V',
        aspectRatio: '9:16',
      },
      makeOptions({ id: 'org-1' }, 'profile-1')
    );

    expect(result).toEqual({
      error: 'Conteudo recusado pela moderacao do kie.ai.',
    });
  });

  it('nao expoe detalhes de excecao inesperada', async () => {
    mediaService.generateAiVideo.mockRejectedValue(
      new Error('provider secret sk-sensitive')
    );

    const result = await exec(
      {
        prompt: 'cidade futurista',
        mode: 'T2V',
        aspectRatio: '9:16',
      },
      makeOptions({ id: 'org-1' }, 'profile-1')
    );

    expect(result).toEqual({
      error: 'Nao foi possivel gerar o video. Tente novamente.',
    });
  });
});
