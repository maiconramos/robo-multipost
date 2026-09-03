const mockFileTypeFromBuffer = jest.fn();

jest.mock('file-type', () => ({
  fileTypeFromBuffer: mockFileTypeFromBuffer,
}));

import { detectAllowedUploadMime } from './allowed.upload.mime';
import { execFileSync } from 'child_process';

describe('detectAllowedUploadMime', () => {
  beforeEach(() => {
    mockFileTypeFromBuffer.mockReset();
  });

  it('uses the current file-type API and accepts an allow-listed signature', async () => {
    const buffer = Buffer.from('fake-image');
    mockFileTypeFromBuffer.mockResolvedValue({
      mime: 'image/png',
      ext: 'png',
    });

    await expect(detectAllowedUploadMime(buffer)).resolves.toEqual({
      mime: 'image/png',
      ext: 'png',
    });
    expect(mockFileTypeFromBuffer).toHaveBeenCalledWith(buffer);
  });

  it('keeps rejecting detected types outside the upload allow-list', async () => {
    mockFileTypeFromBuffer.mockResolvedValue({
      mime: 'image/svg+xml',
      ext: 'svg',
    });

    await expect(
      detectAllowedUploadMime(Buffer.from('<svg></svg>'))
    ).resolves.toBeNull();
  });

  it('loads the real ESM package from the supported Node runtime', () => {
    const script = `
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64'
      );
      require('file-type').fileTypeFromBuffer(png)
        .then((detected) => {
          if (detected?.mime !== 'image/png') process.exitCode = 1;
        })
        .catch(() => { process.exitCode = 1; });
    `;

    expect(() =>
      execFileSync(
        process.execPath,
        ['--experimental-require-module', '-e', script],
        {
          cwd: process.cwd(),
        }
      )
    ).not.toThrow();
  });
});
