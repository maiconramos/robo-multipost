import { BadRequestException } from '@nestjs/common';
import { CustomFileValidationPipe } from './custom.upload.validation';

// PNG 1x1 valido (assinatura magic-byte real) para o caminho de sucesso.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

describe('CustomFileValidationPipe', () => {
  let pipe: CustomFileValidationPipe;

  beforeEach(() => {
    pipe = new CustomFileValidationPipe();
  });

  it('repassa valores que nao sao arquivo (org/body/query)', async () => {
    const org = { id: 'org-1' };
    await expect(pipe.transform(org)).resolves.toBe(org);
  });

  it('repassa null/undefined', async () => {
    await expect(pipe.transform(undefined)).resolves.toBeUndefined();
  });

  it('lanca quando o parametro de arquivo nao tem buffer', async () => {
    await expect(
      pipe.transform({ fieldname: 'file', mimetype: 'image/png', size: 10 })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita conteudo que nao casa com a allowlist (texto disfarcado)', async () => {
    const file = {
      fieldname: 'file',
      buffer: Buffer.from('<svg onload=alert(1)></svg>', 'utf8'),
      mimetype: 'image/svg+xml',
      originalname: 'evil.png',
      size: 30,
    };
    await expect(pipe.transform(file)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('aceita PNG real, normaliza mimetype e reescreve o nome com a extensao correta', async () => {
    const file = {
      fieldname: 'file',
      buffer: PNG_1x1,
      mimetype: 'application/octet-stream', // declarado errado de proposito
      originalname: 'foto.exe',
      size: PNG_1x1.length,
    };

    const result = await pipe.transform(file);

    expect(result.mimetype).toBe('image/png');
    expect(result.originalname).toBe('foto.png');
  });

  it('rejeita arquivo acima do tamanho maximo do tipo', async () => {
    const file = {
      fieldname: 'file',
      buffer: PNG_1x1,
      mimetype: 'image/png',
      originalname: 'grande.png',
      size: 11 * 1024 * 1024, // > 10 MB (limite de imagem)
    };
    await expect(pipe.transform(file)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
