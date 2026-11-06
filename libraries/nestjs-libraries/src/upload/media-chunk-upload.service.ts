import {
  HttpException,
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { constants } from 'fs';
import {
  chmod,
  lstat,
  mkdtemp,
  open,
  readdir,
  rm,
  statfs,
  writeFile,
} from 'fs/promises';
import { hostname, tmpdir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import {
  appendMediaUploadSchema,
  beginMediaUploadSchema,
  mediaUploadSessionSchema,
  MCP_CHUNK_UPLOAD_MAX_BYTES,
  MCP_UPLOAD_PART_MAX_BYTES,
} from '../dtos/media/agent-media.dto';
import { MediaTransferService } from './media-transfer.service';

export const MEDIA_CHUNK_TEMP_PARENT = 'MEDIA_CHUNK_TEMP_PARENT';
const TTL = 60 * 60_000;
const ROOT_PREFIX = 'multipost-mcp-media-';
const MAX_SESSIONS = 200;
const MAX_ACTIVE = 8;
const MAX_RESERVED = 4 * MCP_CHUNK_UPLOAD_MAX_BYTES;
type SavedMedia = {
  id: string;
  name: string;
  path: string;
  originalName: string | null;
};
type Session = {
  uploadId: string;
  organizationId: string;
  profileId?: string;
  filename: string;
  path: string;
  size: number;
  sha256: string;
  offset: number;
  state: 'receiving' | 'committing' | 'completed' | 'unknown';
  expiresAt: number;
  busy: boolean;
  media?: SavedMedia;
  last?: { offset: number; size: number; sha256: string };
  clientRequestId?: string;
};
const fail = (code: string, status = 400): never => {
  throw new HttpException(code, status);
};
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');

/** Ephemeral, worker-local sessions: no Redis payloads, public temp paths or durable locks. */
@Injectable()
export class MediaChunkUploadService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly sessions = new Map<string, Session>();
  private root?: Promise<string>;
  private timer?: ReturnType<typeof setInterval>;
  private closing = false;
  constructor(
    private readonly transfer: MediaTransferService,
    @Optional()
    @Inject(MEDIA_CHUNK_TEMP_PARENT)
    private readonly parent = tmpdir()
  ) {}

  async onApplicationBootstrap() {
    this.timer = setInterval(() => {
      void this.cleanup().catch(() => undefined);
    }, 60_000);
    this.timer.unref();
  }

  private async directory() {
    if (!this.root)
      this.root = (async () => {
        await this.cleanupDeadProcesses();
        const root = await mkdtemp(join(this.parent, ROOT_PREFIX));
        await chmod(root, 0o700);
        await writeFile(
          join(root, '.owner.json'),
          JSON.stringify({ pid: process.pid, host: hostname() }),
          { mode: 0o600, flag: 'wx' }
        );
        return root;
      })();
    return this.root;
  }

  private async cleanupDeadProcesses() {
    // Do not follow symlinks or remove roots whose live/dead ownership is unknown.
    const roots = (await readdir(this.parent, { withFileTypes: true }))
      .filter((e) => e.name.startsWith(ROOT_PREFIX) && e.isDirectory())
      .slice(0, 100);
    for (const entry of roots) {
      const path = join(this.parent, entry.name);
      try {
        const info = await lstat(path);
        if (
          !info.isDirectory() ||
          info.mode & 0o077 ||
          (process.getuid && info.uid !== process.getuid())
        )
          continue;
        const marker = await open(
          join(path, '.owner.json'),
          constants.O_RDONLY | constants.O_NOFOLLOW
        );
        let owner: { pid: number; host: string };
        try {
          if ((await marker.stat()).size > 4096) continue;
          owner = JSON.parse(await marker.readFile('utf8'));
        } finally {
          await marker.close();
        }
        if (
          owner.host !== hostname() ||
          !Number.isInteger(owner.pid) ||
          owner.pid <= 0
        )
          continue;
        try {
          process.kill(owner.pid, 0);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH')
            await rm(path, { recursive: true, force: true });
        }
      } catch {
        /* Unknown ownership is never permission to remove a directory. */
      }
    }
  }

  private parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) fail('INVALID_UPLOAD_INPUT');
    return parsed.data;
  }

  private get(
    organizationId: string,
    profileId: string | undefined,
    uploadId: string
  ) {
    if (!organizationId) fail('ORGANIZATION_REQUIRED', 401);
    this.parse(mediaUploadSessionSchema, { uploadId });
    const session = this.sessions.get(uploadId);
    if (
      !session ||
      session.organizationId !== organizationId ||
      session.profileId !== profileId ||
      (session.expiresAt <= Date.now() && !session.busy)
    )
      fail('UPLOAD_NOT_FOUND', 404);
    return session;
  }

  private view(session: Session) {
    return {
      uploadId: session.uploadId,
      state: session.state,
      size: session.size,
      offset: session.offset,
      maxChunkBytes: MCP_UPLOAD_PART_MAX_BYTES,
      expiresAt: new Date(session.expiresAt).toISOString(),
      ...(session.media ? { media: session.media } : {}),
    };
  }

  private async locked<T>(session: Session, operation: () => Promise<T>) {
    if (session.busy) fail('UPLOAD_BUSY', 409);
    session.busy = true;
    try {
      return await operation();
    } finally {
      session.busy = false;
    }
  }

  async begin(
    organizationId: string,
    profileId: string | undefined,
    raw: z.infer<typeof beginMediaUploadSchema>
  ) {
    if (!organizationId) fail('ORGANIZATION_REQUIRED', 401);
    if (this.closing) fail('UPLOAD_UNAVAILABLE', 503);
    const input = this.parse(beginMediaUploadSchema, raw);
    const root = await this.directory();
    await this.cleanup();
    if (input.clientRequestId) {
      const previous = [...this.sessions.values()].find(
        (s) =>
          s.organizationId === organizationId &&
          s.profileId === profileId &&
          s.clientRequestId === input.clientRequestId
      );
      if (previous) {
        if (
          previous.filename !== input.filename ||
          previous.size !== input.size ||
          previous.sha256 !== input.sha256
        )
          fail('UPLOAD_REQUEST_CONFLICT', 409);
        return this.view(previous);
      }
    }
    const disk = await statfs(root);
    if (input.clientRequestId) {
      const previous = [...this.sessions.values()].find(
        (s) =>
          s.organizationId === organizationId &&
          s.profileId === profileId &&
          s.clientRequestId === input.clientRequestId
      );
      if (previous) {
        if (
          previous.filename !== input.filename ||
          previous.size !== input.size ||
          previous.sha256 !== input.sha256
        )
          fail('UPLOAD_REQUEST_CONFLICT', 409);
        return this.view(previous);
      }
    }
    const active = [...this.sessions.values()].filter(
      (s) => s.state !== 'completed'
    );
    const reserved = active.reduce((n, s) => n + s.size, 0);
    const remaining = active.reduce(
      (n, s) => n + Math.max(0, s.size - s.offset),
      0
    );
    if (
      this.sessions.size >= MAX_SESSIONS ||
      active.length >= MAX_ACTIVE ||
      active.filter((s) => s.organizationId === organizationId).length >= 2 ||
      reserved + input.size > MAX_RESERVED
    )
      fail('UPLOAD_QUOTA_EXCEEDED', 429);
    if (
      Number(disk.bavail) * Number(disk.bsize) <
      remaining + input.size + 128 * 1024 * 1024
    )
      fail('UPLOAD_DISK_FULL', 507);
    const uploadId = randomBytes(32).toString('hex');
    const session: Session = {
      filename: input.filename,
      size: input.size,
      sha256: input.sha256,
      clientRequestId: input.clientRequestId,
      uploadId,
      organizationId,
      profileId,
      path: join(root, `${uploadId}.part`),
      offset: 0,
      state: 'receiving',
      busy: true,
      expiresAt: Date.now() + TTL,
    };
    // Reserve synchronously before the first asynchronous file operation.
    this.sessions.set(uploadId, session);
    try {
      const file = await open(session.path, 'wx', 0o600);
      await file.close();
      return this.view(session);
    } catch (error) {
      this.sessions.delete(uploadId);
      throw error;
    } finally {
      session.busy = false;
    }
  }

  async status(
    organizationId: string,
    profileId: string | undefined,
    uploadId: string
  ) {
    return this.view(this.get(organizationId, profileId, uploadId));
  }

  async append(
    organizationId: string,
    profileId: string | undefined,
    raw: z.infer<typeof appendMediaUploadSchema>
  ) {
    const input = this.parse(appendMediaUploadSchema, raw);
    const session = this.get(organizationId, profileId, input.uploadId);
    return this.locked(session, async () => {
      if (session.state !== 'receiving') fail('UPLOAD_NOT_RECEIVING', 409);
      const value = input.base64;
      if (value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
        fail('INVALID_BASE64');
      const bytes = Buffer.from(value, 'base64');
      if (
        !bytes.length ||
        bytes.length > MCP_UPLOAD_PART_MAX_BYTES ||
        bytes.toString('base64') !== value
      )
        fail('INVALID_BASE64');
      const digest = hash(bytes);
      const file = await open(
        session.path,
        constants.O_RDWR | constants.O_NOFOLLOW
      );
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size < session.offset)
          fail('UPLOAD_CORRUPTED', 409);
        if (info.size > session.offset) await file.truncate(session.offset);
        if (input.offset !== session.offset) {
          const last = session.last;
          if (
            !last ||
            last.offset !== input.offset ||
            last.size !== bytes.length ||
            last.sha256 !== digest
          )
            fail('UPLOAD_OFFSET_MISMATCH', 409);
          const stored = Buffer.alloc(bytes.length);
          let read = 0;
          while (read < stored.length) {
            const part = await file.read(
              stored,
              read,
              stored.length - read,
              input.offset + read
            );
            if (!part.bytesRead) fail('UPLOAD_CORRUPTED', 409);
            read += part.bytesRead;
          }
          if (!stored.equals(bytes)) fail('UPLOAD_CORRUPTED', 409);
          return this.view(session);
        }
        if (session.offset + bytes.length > session.size)
          fail('UPLOAD_SIZE_EXCEEDED');
        let written = 0;
        try {
          while (written < bytes.length) {
            const result = await file.write(
              bytes,
              written,
              bytes.length - written,
              session.offset + written
            );
            if (!result.bytesWritten) fail('UPLOAD_WRITE_FAILED', 500);
            written += result.bytesWritten;
          }
          await file.sync();
        } catch (error) {
          await file.truncate(session.offset);
          throw error;
        }
        session.last = {
          offset: session.offset,
          size: bytes.length,
          sha256: digest,
        };
        session.offset += bytes.length;
        return this.view(session);
      } finally {
        await file.close();
      }
    });
  }

  async complete(
    organizationId: string,
    profileId: string | undefined,
    uploadId: string
  ) {
    const session = this.get(organizationId, profileId, uploadId);
    return this.locked(session, async () => {
      if (session.state === 'completed') return this.view(session);
      if (session.state !== 'receiving') fail('UPLOAD_RESULT_UNKNOWN', 409);
      if (session.offset !== session.size) fail('UPLOAD_INCOMPLETE', 409);
      const checksum = createHash('sha256');
      const handle = await open(
        session.path,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      const stream = handle.createReadStream({ autoClose: false });
      try {
        for await (const bytes of stream) checksum.update(bytes);
      } finally {
        stream.destroy();
        await handle.close();
      }
      if (checksum.digest('hex') !== session.sha256)
        fail('UPLOAD_CHECKSUM_MISMATCH');
      session.state = 'committing';
      try {
        const saved = await this.transfer.fromPath(
          organizationId,
          profileId,
          session.filename,
          session.path,
          session.size
        );
        session.media = {
          id: saved.id,
          name: saved.name,
          path: saved.path,
          originalName: saved.originalName ?? null,
        };
        session.state = 'completed';
        session.expiresAt = Date.now() + TTL;
        await rm(session.path, { force: true }).catch(() => undefined);
        return this.view(session);
      } catch {
        session.state = 'unknown';
        return fail('UPLOAD_RESULT_UNKNOWN', 409);
      }
    });
  }

  async abort(
    organizationId: string,
    profileId: string | undefined,
    uploadId: string
  ) {
    const session = this.get(organizationId, profileId, uploadId);
    return this.locked(session, async () => {
      if (session.state === 'completed') fail('UPLOAD_ALREADY_COMPLETED', 409);
      await rm(session.path, { force: true });
      this.sessions.delete(uploadId);
      return { uploadId, state: 'aborted' as const };
    });
  }

  async cleanup() {
    for (const session of this.sessions.values()) {
      if (session.busy || session.expiresAt > Date.now()) continue;
      await this.locked(session, async () => {
        await rm(session.path, { force: true });
        this.sessions.delete(session.uploadId);
      });
    }
  }

  async onModuleDestroy() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    if (this.root && ![...this.sessions.values()].some((s) => s.busy)) {
      await rm(await this.root, { recursive: true, force: true });
      this.sessions.clear();
    }
  }
}
