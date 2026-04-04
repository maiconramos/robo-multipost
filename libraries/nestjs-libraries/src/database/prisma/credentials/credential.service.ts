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
    data: Record<string, string>,
    profileId?: string
  ) {
    const existing = await this.getRaw(organizationId, provider, profileId);
    const merged = existing ? this.unredact(data, existing) : data;
    const encryptedData = this._encryptionService.encryptJson(merged);
    return this._credentialRepository.upsert(
      organizationId,
      provider,
      encryptedData,
      profileId
    );
  }

  async getRedacted(
    organizationId: string,
    provider: string,
    profileId?: string
  ): Promise<{ data: Record<string, string>; updatedAt: Date } | null> {
    const record = await this._credentialRepository.findByProvider(
      organizationId,
      provider,
      profileId
    );
    if (!record) return null;
    const data = this._encryptionService.decryptJson(record.encryptedData) as Record<string, string>;
    return { data: this.redact(data), updatedAt: record.updatedAt };
  }

  async getRaw(
    organizationId: string,
    provider: string,
    profileId?: string
  ): Promise<Record<string, string> | null> {
    const record = await this._credentialRepository.findByProvider(
      organizationId,
      provider,
      profileId
    );
    if (!record) return null;
    return this._encryptionService.decryptJson(record.encryptedData) as Record<string, string>;
  }

  async listByOrg(organizationId: string, profileId?: string) {
    const records =
      await this._credentialRepository.findAllByOrg(organizationId, profileId);
    return records.map((r) => ({
      provider: r.provider,
      configured: true,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async configureInstagramWebhook(
    organizationId: string,
    callbackUrl: string,
    profileId?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const creds = await this.getRaw(organizationId, 'facebook', profileId);
    if (!creds?.clientId || !creds?.clientSecret) {
      return {
        ok: false,
        error:
          'Configure Client ID e Client Secret do Facebook antes de configurar o webhook.',
      };
    }

    const appId = creds.clientId;
    const appAccessToken = `${appId}|${creds.clientSecret}`;
    const verifyToken = creds.webhookVerifyToken || 'multipost';

    try {
      const params = new URLSearchParams({
        object: 'instagram',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: 'comments,messages',
        include_values: 'true',
        access_token: appAccessToken,
      });
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${appId}/subscriptions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error) {
        return {
          ok: false,
          error:
            body?.error?.message ||
            `Meta retornou ${res.status}. Verifique o callback URL (deve ser HTTPS publico) e os produtos do app (Webhooks + Instagram).`,
        };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Erro ao chamar API Meta.' };
    }
  }

  async findAllDecrypted(provider: string) {
    const records = await this._credentialRepository.findAllByProviderAcrossOrgs(
      provider
    );
    return records.map((r) => ({
      organizationId: r.organizationId,
      profileId: r.profileId,
      data: this._encryptionService.decryptJson(r.encryptedData) as Record<
        string,
        string
      >,
    }));
  }

  async delete(organizationId: string, provider: string, profileId?: string) {
    return this._credentialRepository.delete(organizationId, provider, profileId);
  }

  async test(
    organizationId: string,
    provider: string,
    profileId?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const raw = await this.getRaw(organizationId, provider, profileId);
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
        const empty = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
        if (empty.length > 0) {
          return { ok: false, error: `Campos vazios: ${empty.join(', ')}` };
        }
        return { ok: true };
      }
    }
  }
}
