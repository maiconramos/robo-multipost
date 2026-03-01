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
    _organizationId: string,
    _provider: string
  ): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }
}
