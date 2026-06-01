jest.mock('nostr-tools', () => ({
  SimplePool: class {},
  finalizeEvent: jest.fn(),
  getPublicKey: jest.fn(),
  nip19: {},
}));

import { runWithContext } from '@gitroom/nestjs-libraries/chat/async.storage';
import { UploadMediaFromUrlTool } from './upload.media.from.url.tool';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

describe('UploadMediaFromUrlTool', () => {
  it('deve propagar o profileId do contexto para o MediaService.uploadFromUrl', async () => {
    const mediaService = createMock<MediaService>();
    mediaService.uploadFromUrl.mockResolvedValue({ id: 'm-1', path: 'p' } as any);
    const tool = new UploadMediaFromUrlTool(mediaService);
    await runWithContext(
      { requestId: 'k', auth: { id: 'org-1' }, profileId: 'profile-1' },
      async () => {
        await tool.run().execute({ url: 'https://x/y.jpg' } as any, {} as any);
      }
    );
    expect(mediaService.uploadFromUrl).toHaveBeenCalledWith(
      'org-1',
      'https://x/y.jpg',
      undefined,
      'profile-1'
    );
  });
});
