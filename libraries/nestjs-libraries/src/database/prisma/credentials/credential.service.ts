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
        // Facebook/Instagram/Threads: client_credentials grant valida app_id + app_secret
        const res = await fetch(
          `https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(creds.clientId)}&client_secret=${encodeURIComponent(creds.clientSecret)}&grant_type=client_credentials`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: body?.error?.message || `Facebook retornou ${res.status}` };
        }
        return { ok: true };
      }
      case 'twitter': {
        // Twitter/X: App-only bearer token via client_credentials
        const encoded = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
        const res = await fetch('https://api.x.com/oauth2/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${encoded}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg = body?.errors?.[0]?.message || `Twitter retornou ${res.status}`;
          return { ok: false, error: msg };
        }
        return { ok: true };
      }
      case 'reddit': {
        // Reddit: client_credentials grant
        const encoded = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
        const res = await fetch('https://www.reddit.com/api/v1/access_token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${encoded}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'RoboMultipost/1.0',
          },
          body: 'grant_type=client_credentials',
        });
        if (!res.ok) {
          return { ok: false, error: `Reddit retornou ${res.status} — credenciais inválidas.` };
        }
        return { ok: true };
      }
      case 'discord': {
        // Discord: client_credentials grant com scope=identify
        const encoded = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
        const res = await fetch('https://discord.com/api/v10/oauth2/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${encoded}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'grant_type=client_credentials&scope=identify',
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: body?.error_description || `Discord retornou ${res.status}` };
        }
        return { ok: true };
      }
      case 'tiktok': {
        // TikTok: client access token (client_key no body, não no header)
        // TikTok retorna HTTP 200 mesmo com credenciais inválidas — erro vem no body JSON
        const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: creds.clientId,
            client_secret: creds.clientSecret,
            grant_type: 'client_credentials',
          }).toString(),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.error) {
          return { ok: false, error: body?.error_description || `TikTok retornou ${res.status}` };
        }
        return { ok: true };
      }
      default: {
        // LinkedIn, YouTube, Pinterest, Slack: sem endpoint client_credentials
        // Valida apenas que os campos obrigatórios não estão vazios
        const empty = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
        if (empty.length > 0) {
          return { ok: false, error: `Campos vazios: ${empty.join(', ')}` };
        }
        return { ok: true };
      }
    }
  }
}
