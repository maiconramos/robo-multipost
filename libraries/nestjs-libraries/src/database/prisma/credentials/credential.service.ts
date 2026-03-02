import { Injectable } from '@nestjs/common';
import { CredentialRepository } from './credential.repository';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';

const SENTINEL = '__REDACTED__';

@Injectable()
export class CredentialService {
  constructor(
    private _credentialRepository: CredentialRepository,
    private _encryptionService: EncryptionService
  ) {}

  private redact(data: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        value ? SENTINEL : '',
      ])
    );
  }

  private unredact(
    incoming: Record<string, string>,
    current: Record<string, string>
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(incoming).map(([key, value]) => [
        key,
        value === SENTINEL ? (current[key] ?? '') : value,
      ])
    );
  }

  async save(
    organizationId: string,
    provider: string,
    data: Record<string, string>
  ) {
    const existing = await this.getRaw(organizationId, provider);
    const merged = existing ? this.unredact(data, existing) : data;
    const encryptedData = this._encryptionService.encryptJson(merged);
    return this._credentialRepository.upsert(
      organizationId,
      provider,
      encryptedData
    );
  }

  async getRedacted(
    organizationId: string,
    provider: string
  ): Promise<{ data: Record<string, string>; updatedAt: Date } | null> {
    const record = await this._credentialRepository.findByProvider(
      organizationId,
      provider
    );
    if (!record) return null;
    const data = this._encryptionService.decryptJson(record.encryptedData) as Record<string, string>;
    return { data: this.redact(data), updatedAt: record.updatedAt };
  }

  async getRaw(
    organizationId: string,
    provider: string
  ): Promise<Record<string, string> | null> {
    const record = await this._credentialRepository.findByProvider(
      organizationId,
      provider
    );
    if (!record) return null;
    return this._encryptionService.decryptJson(record.encryptedData) as Record<string, string>;
  }

  async listByOrg(organizationId: string) {
    const records =
      await this._credentialRepository.findAllByOrg(organizationId);
    return records.map((r) => ({
      provider: r.provider,
      configured: true,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async delete(organizationId: string, provider: string) {
    return this._credentialRepository.delete(organizationId, provider);
  }

  async test(
    organizationId: string,
    provider: string
  ): Promise<{ ok: boolean; error?: string }> {
    const raw = await this.getRaw(organizationId, provider);
    if (!raw) {
      return { ok: false, error: 'Nenhuma credencial configurada para este provider.' };
    }

    const { clientId, clientSecret } = raw;
    if (!clientId || !clientSecret) {
      return { ok: false, error: 'Client ID e Client Secret são obrigatórios.' };
    }

    try {
      const result = await this.validateCredential(provider, raw);
      return result;
    } catch (e: any) {
      return { ok: false, error: e.message || 'Erro ao testar credencial.' };
    }
  }

  private async validateCredential(
    provider: string,
    creds: Record<string, string>
  ): Promise<{ ok: boolean; error?: string }> {
    switch (provider) {
      case 'facebook': {
        // Facebook/Instagram: App Token endpoint validates client_id + client_secret
        const res = await fetch(
          `https://graph.facebook.com/oauth/access_token?client_id=${creds.clientId}&client_secret=${creds.clientSecret}&grant_type=client_credentials`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: body?.error?.message || `Facebook retornou ${res.status}` };
        }
        return { ok: true };
      }
      case 'linkedin': {
        // LinkedIn doesn't have a simple token validation endpoint
        // Validate format only
        if (creds.clientId.length < 10 || creds.clientSecret.length < 5) {
          return { ok: false, error: 'Client ID ou Client Secret parecem inválidos (muito curtos).' };
        }
        return { ok: true };
      }
      default: {
        // For providers without a test endpoint, validate that fields are non-empty
        const empty = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
        if (empty.length > 0) {
          return { ok: false, error: `Campos vazios: ${empty.join(', ')}` };
        }
        return { ok: true };
      }
    }
  }
}
