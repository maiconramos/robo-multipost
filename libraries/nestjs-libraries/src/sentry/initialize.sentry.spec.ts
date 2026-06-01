// O bug original: initialize.sentry.ts importava @sentry/profiling-node no
// topo do modulo, carregando um binario nativo no load. Em imagens sem esse
// binario (linux-x64 + Node novo), so de importar este modulo o processo
// caia — derrubando backend e orchestrator no boot, mesmo sem Sentry
// configurado. Este spec garante que: (1) importar o modulo nao quebra; (2)
// sem DSN nada e inicializado; (3) com DSN o Sentry inicializa sem lancar.
jest.mock('@sentry/nestjs', () => ({
  init: jest.fn(),
  consoleLoggingIntegration: jest.fn(() => ({ name: 'console' })),
  openAIIntegration: jest.fn(() => ({ name: 'openai' })),
}));

import * as Sentry from '@sentry/nestjs';
import { initializeSentry } from './initialize.sentry';

describe('initializeSentry', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('deve retornar null e nao inicializar o Sentry quando o DSN esta ausente', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const result = initializeSentry('backend');

    expect(result).toBeNull();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('deve inicializar o Sentry quando o DSN esta presente, sem lancar', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://exemplo@sentry.io/1';

    const result = initializeSentry('backend');

    expect(result).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const config = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(config.dsn).toBe('https://exemplo@sentry.io/1');
    expect(Array.isArray(config.integrations)).toBe(true);
  });
});
