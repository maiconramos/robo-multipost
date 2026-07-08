import { Injectable, Logger } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { Resend } from 'resend';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { InfraHealthRepository } from '@gitroom/nestjs-libraries/database/prisma/status/infra-health.repository';
import {
  InfraHealthComponent,
  InfraHealthKey,
  InfraHealthResponse,
  InfraHealthStatus,
} from '@gitroom/nestjs-libraries/dtos/status/infra-health.dto';

const CACHE_TTL_MS = 30_000;
// Piso curto respeitado MESMO com `force` (botão "Verificar agora"): impede que
// um loop de ?refresh=true dispare sondas sem backpressure (o throttler global
// só cobre POST /public/v1/posts, não esta rota).
const FORCE_FLOOR_MS = 5_000;
const TIMEOUT_DB_MS = 5000;
const TIMEOUT_STORAGE_MS = 5000;
const TIMEOUT_REDIS_MS = 3000;
const TIMEOUT_TEMPORAL_MS = 3000;
const TIMEOUT_EMAIL_MS = 5000;
const REASON_CAP = 200;

/**
 * Serviço de INFRA (não domínio) — aba Status > Saúde da infra. Sonda ATIVA de
 * cada componente (pega credencial errada / serviço fora do ar, não só presença
 * de config), com timeout por sonda e cache de 30s (`force` ignora o cache).
 *
 * Cada `checkX` é totalmente guardado (try/catch) e NUNCA rejeita — o
 * `Promise.all` não pode curto-circuitar por causa de uma sonda (senão o board
 * inteiro cairia). Mensagens são sanitizadas (name+message, cap 200) — NUNCA
 * expõem credencial. `Date.now()`/`new Date()` OK aqui (backend, não workflow).
 */
@Injectable()
export class InfraHealthService {
  private readonly logger = new Logger(InfraHealthService.name);
  private cache: { at: number; result: InfraHealthResponse } | null = null;

  constructor(
    private _infraHealthRepository: InfraHealthRepository,
    private _temporalService: TemporalService
  ) {}

  async getHealth(force = false): Promise<InfraHealthResponse> {
    // Gate por env — HABILITADO POR DEFAULT (só STATUS_INFRA_HEALTH_ENABLED=false
    // desabilita). Desabilitado => não sonda nada e não expõe estado de infra
    // (mitiga a exposição a admin-de-org numa instância de registro aberto).
    if (process.env.STATUS_INFRA_HEALTH_ENABLED === 'false') {
      return {
        enabled: false,
        components: [],
        checkedAt: new Date().toISOString(),
        summary: { ok: 0, warning: 0, error: 0 },
      };
    }

    // `force` ignora o cache de 30s, mas ainda respeita o piso de 5s — sondar
    // Temporal/R2 (API cobrada) num loop sem limite seria um vetor de DoS.
    const ttl = force ? FORCE_FLOOR_MS : CACHE_TTL_MS;
    if (this.cache && Date.now() - this.cache.at < ttl) {
      return this.cache.result;
    }

    const components = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkTemporal(),
      this.checkStorage(),
      this.checkEmail(),
    ]);

    const result: InfraHealthResponse = {
      enabled: true,
      components,
      checkedAt: new Date().toISOString(),
      summary: {
        ok: components.filter((c) => c.status === 'ok').length,
        warning: components.filter((c) => c.status === 'warning').length,
        error: components.filter((c) => c.status === 'error').length,
      },
    };
    this.cache = { at: Date.now(), result };
    return result;
  }

  private async checkDatabase(): Promise<InfraHealthComponent> {
    const started = Date.now();
    try {
      await this.withTimeout(
        this._infraHealthRepository.ping(),
        TIMEOUT_DB_MS,
        'database'
      );
      return this.build('database', 'ok', null, started);
    } catch (err) {
      return this.build('database', 'error', this.reason(err), started);
    }
  }

  private async checkRedis(): Promise<InfraHealthComponent> {
    const started = Date.now();
    // Sem REDIS_URL, `ioRedis` é um MockRedis em memória (sem `ping`).
    if (!process.env.REDIS_URL) {
      return this.build(
        'redis',
        'warning',
        'Redis não configurado (mock em memória)',
        null
      );
    }
    // maxRetriesPerRequest:null faz o `ping()` pendurar quando o Redis está
    // fora; um Promise.race NÃO cancela o comando — checar o `status` antes
    // evita empilhar pings na fila offline do singleton compartilhado.
    const status = (ioRedis as unknown as { status?: string }).status;
    if (status !== 'ready') {
      return this.build(
        'redis',
        'error',
        `Redis inacessível (status: ${status ?? 'desconhecido'})`,
        started
      );
    }
    try {
      await this.withTimeout(ioRedis.ping(), TIMEOUT_REDIS_MS, 'redis');
      return this.build('redis', 'ok', null, started);
    } catch (err) {
      return this.build('redis', 'error', this.reason(err), started);
    }
  }

  private async checkTemporal(): Promise<InfraHealthComponent> {
    const started = Date.now();
    try {
      const connection = (
        this._temporalService?.client?.getRawClient() as any
      )?.connection;
      if (!connection?.workflowService) {
        return this.build('temporal', 'error', 'Temporal não conectado', started);
      }
      await this.withTimeout(
        connection.workflowService.getSystemInfo({}),
        TIMEOUT_TEMPORAL_MS,
        'temporal'
      );
      return this.build('temporal', 'ok', null, started);
    } catch (err) {
      return this.build('temporal', 'error', this.reason(err), started);
    }
  }

  private async checkStorage(): Promise<InfraHealthComponent> {
    const started = Date.now();
    const provider = process.env.STORAGE_PROVIDER || 'local';
    try {
      // createStorage() pode lançar sincronamente (provider inválido) — por
      // isso fica DENTRO do try, senão o Promise.all curto-circuitaria.
      const storage = UploadFactory.createStorage();
      await this.withTimeout(
        storage.healthCheck(),
        TIMEOUT_STORAGE_MS,
        'storage'
      );
      return this.build('storage', 'ok', provider, started);
    } catch (err) {
      return this.build(
        'storage',
        'error',
        `${provider}: ${this.reason(err)}`,
        started
      );
    }
  }

  private async checkEmail(): Promise<InfraHealthComponent> {
    const started = Date.now();
    const provider = process.env.EMAIL_PROVIDER;

    // Resend: validação ATIVA da chave via domains.list (GET autenticado — não
    // envia e-mail). Chave ausente/dummy => só "não configurado".
    if (provider === 'resend') {
      const key = process.env.RESEND_API_KEY;
      if (!key || key === 're_132') {
        return this.build('email', 'warning', 'Resend sem RESEND_API_KEY', null);
      }
      try {
        const res: any = await this.withTimeout(
          new Resend(key).domains.list() as Promise<unknown>,
          TIMEOUT_EMAIL_MS,
          'email'
        );
        if (res?.error) {
          return this.build(
            'email',
            'error',
            `Resend: ${this.reason(res.error)}`,
            started
          );
        }
        return this.build('email', 'ok', 'Resend', started);
      } catch (err) {
        return this.build(
          'email',
          'error',
          `Resend: ${this.reason(err)}`,
          started
        );
      }
    }

    // SMTP (nodemailer): sonda só de presença das variáveis (a conexão/entrega
    // não é testada aqui) — com tooltip explicando. Faltando variável => config
    // incompleta.
    if (provider === 'nodemailer') {
      const required = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];
      const missing = required.filter((k) => !process.env[k]);
      const note =
        'Validação apenas de presença das variáveis SMTP — a conexão/entrega não é testada aqui.';
      if (missing.length) {
        return this.build(
          'email',
          'error',
          `SMTP incompleto: falta ${missing.join(', ')}`,
          null,
          note
        );
      }
      return this.build('email', 'ok', 'SMTP (nodemailer)', null, note);
    }

    // Sem provider (ou desconhecido) => EmptyProvider: e-mails viram no-op.
    return this.build(
      'email',
      'warning',
      'E-mail não configurado (EMAIL_PROVIDER)',
      null
    );
  }

  private build(
    key: InfraHealthKey,
    status: InfraHealthStatus,
    message: string | null,
    started: number | null,
    note: string | null = null
  ): InfraHealthComponent {
    // Surfacea a falha no log/Sentry (não só na tela de quem abrir o Status) —
    // é o propósito da feature. Mensagem já sanitizada (name+message, redigida).
    if (status === 'error') {
      this.logger.warn(`sonda ${key} falhou: ${message ?? 'sem detalhe'}`);
    }
    return {
      key,
      status,
      message,
      latencyMs: started != null ? Date.now() - started : null,
      note,
    };
  }

  // Promise.race com timeout que rejeita — mesmo padrão do AiWebSearchService.
  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    operation: string
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${operation} excedeu ${ms}ms`)),
        ms
      );
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  // name+message, cap 200 — nunca serializa o objeto cru (defesa contra
  // vazar credencial numa mensagem de erro de provider).
  private reason(err: unknown): string {
    const e = err as Error;
    const raw =
      e?.name && e?.message ? `${e.name}: ${e.message}` : String(err ?? '');
    const msg = this.redact(raw);
    return msg.length > REASON_CAP ? msg.slice(0, REASON_CAP) : msg;
  }

  // Defesa em profundidade: raspa padrões de credencial que um SDK poderia
  // ecoar na mensagem de erro (senha em connection string, AWS access key,
  // bearer token) antes de trafegar pela API admin.
  private redact(text: string): string {
    return text
      .replace(/(\w+:\/\/[^:/@\s]+):[^@\s]+@/g, '$1:***@') // senha em URL
      .replace(/AKIA[0-9A-Z]{16}/g, 'AKIA***') // AWS access key id
      .replace(/Bearer\s+[\w.-]+/gi, 'Bearer ***'); // bearer token
  }
}
