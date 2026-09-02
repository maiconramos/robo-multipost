import 'reflect-metadata';
import dns from 'node:dns/promises';
import { validate } from 'class-validator';
import {
  IsSafeWebhookUrlConstraint,
  isSafePublicHttpsUrl,
} from './webhook.url.validator';
import { OnlyURL } from './webhooks.dto';
import { UploadDto } from '../media/upload.dto';

jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: {
    lookup: jest.fn(),
  },
}));

describe('webhook.url.validator', () => {
  const originalDisableSsrf = process.env.DISABLE_SSRF_PROTECTION;
  const dnsLookup = dns.lookup as jest.Mock;

  beforeEach(() => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    dnsLookup.mockReset();
  });

  afterAll(() => {
    if (originalDisableSsrf === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
      return;
    }

    process.env.DISABLE_SSRF_PROTECTION = originalDisableSsrf;
  });

  it('mantem a validacao publica estrita mesmo com opt-out self-hosted', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';

    await expect(isSafePublicHttpsUrl('https://127.0.0.1/hook')).resolves.toBe(
      false
    );
  });

  it('rejeita webhook privado por padrao', async () => {
    const constraint = new IsSafeWebhookUrlConstraint();

    await expect(
      constraint.validate('https://127.0.0.1/hook', {} as never)
    ).resolves.toBe(false);
  });

  it('permite webhook HTTPS privado no opt-out self-hosted', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    const constraint = new IsSafeWebhookUrlConstraint();

    await expect(
      constraint.validate('https://127.0.0.1/hook', {
        constraints: [true],
      } as never)
    ).resolves.toBe(true);
  });

  it('nao libera validadores de upload no opt-out self-hosted', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    const constraint = new IsSafeWebhookUrlConstraint();

    await expect(
      constraint.validate('https://127.0.0.1/media', {
        constraints: [false],
      } as never)
    ).resolves.toBe(false);
  });

  it('aplica o opt-out no DTO de webhook mas nao no DTO de upload', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    const webhook = Object.assign(new OnlyURL(), {
      url: 'https://127.0.0.1/hook',
    });
    const upload = Object.assign(new UploadDto(), {
      url: 'https://127.0.0.1/media.jpg',
    });

    await expect(validate(webhook)).resolves.toHaveLength(0);
    await expect(validate(upload)).resolves.not.toHaveLength(0);
  });

  it('continua rejeitando webhook HTTP no opt-out self-hosted', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    const constraint = new IsSafeWebhookUrlConstraint();

    await expect(
      constraint.validate('http://127.0.0.1/hook', {
        constraints: [true],
      } as never)
    ).resolves.toBe(false);
  });
});
