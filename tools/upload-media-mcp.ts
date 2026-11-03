/** Programmatic MCP file transport: bytes never pass through an LLM prompt. */
import { constants, createReadStream } from 'fs';
import {
  lstat,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises';
import { createHash, randomBytes } from 'crypto';
import { basename } from 'path';

interface ToolClient {
  callTool(input: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
}
type Receipt = { id: string; path: string; name?: string };
type Progress = {
  uploadId: string;
  state: string;
  offset: number;
  maxChunkBytes: number;
  media?: Receipt;
};
type ResumeState = {
  fileHash: string;
  size: number;
  endpointFingerprint: string;
  profileId?: string;
  clientRequestId: string;
  uploadId?: string;
};
class UploadClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const failure = (code: string, message: string): never => {
  throw new UploadClientError(code, message);
};

async function call(
  client: ToolClient,
  name: string,
  args: Record<string, unknown>
): Promise<Progress> {
  let response: {
    structuredContent?: unknown;
    content?: { type: string; text?: string }[];
    isError?: boolean;
  };
  try {
    response = (await client.callTool({
      name,
      arguments: args,
    })) as typeof response;
  } catch {
    return failure(
      'TRANSPORT_FAILED',
      'Falha de comunicação com o MCP. O estado local foi preservado para retomar.'
    );
  }
  let envelope: { output?: Progress; errors?: string; error?: unknown };
  try {
    envelope = (response.structuredContent ??
      JSON.parse(
        response.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text || '')
          .join('') || '{}'
      )) as typeof envelope;
  } catch {
    return failure('INVALID_RESPONSE', 'O MCP retornou uma resposta inválida.');
  }
  if (response.isError || envelope.errors || envelope.error) {
    let code = 'UPLOAD_FAILED';
    try {
      const errors = JSON.parse(envelope.errors || '[]');
      if (/^[A-Z_]{2,64}$/.test(errors[0]?.error)) code = errors[0].error;
    } catch {
      /* Never echo raw provider/transport error bodies. */
    }
    return failure(
      code,
      code === 'UPLOAD_NOT_FOUND' || code === 'UPLOAD_RESULT_UNKNOWN'
        ? 'Sessão perdida ou resultado incerto. Consulte a biblioteca de mídia antes de iniciar outra transferência.'
        : `Upload não concluído (${code}). O estado local foi preservado.`
    );
  }
  const result = envelope.output;
  if (
    !result ||
    !/^[a-f0-9]{64}$/.test(result.uploadId) ||
    !Number.isSafeInteger(result.offset) ||
    result.offset < 0 ||
    !Number.isSafeInteger(result.maxChunkBytes) ||
    result.maxChunkBytes < 1 ||
    result.maxChunkBytes > 2 * 1024 * 1024
  )
    return failure(
      'INVALID_RESPONSE',
      'O MCP retornou limites ou offset inválidos.'
    );
  return result;
}

async function saveState(path: string, state: ResumeState) {
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(state), {
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function transferLocalMedia(
  client: ToolClient,
  filePath: string,
  statePath: string,
  endpointFingerprint: string,
  delay = sleep,
  profileId?: string
): Promise<Receipt> {
  const connectionClient = client;
  client = {
    callTool: (input) =>
      connectionClient.callTool({
        ...input,
        arguments: { ...input.arguments, ...(profileId ? { profileId } : {}) },
      }),
  };
  const info = await stat(filePath);
  if (!info.isFile() || info.size < 1 || info.size > 1024 ** 3)
    return failure('INVALID_FILE', 'Escolha um arquivo de até 1 GiB.');
  const checksum = createHash('sha256');
  for await (const bytes of createReadStream(filePath)) checksum.update(bytes);
  const fileHash = checksum.digest('hex');
  let state: ResumeState;
  try {
    const meta = await lstat(statePath);
    if (
      !meta.isFile() ||
      meta.mode & 0o077 ||
      meta.size > 8192 ||
      (process.getuid && meta.uid !== process.getuid())
    )
      return failure(
        'UNSAFE_STATE',
        'O arquivo de retomada deve ser privado (0600), regular e do usuário atual.'
      );
    const handle = await open(
      statePath,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      state = JSON.parse(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
    if (
      state.fileHash !== fileHash ||
      state.size !== info.size ||
      state.endpointFingerprint !== endpointFingerprint ||
      state.profileId !== profileId ||
      !/^[a-f0-9]{64}$/.test(state.clientRequestId) ||
      (state.uploadId && !/^[a-f0-9]{64}$/.test(state.uploadId))
    )
      return failure(
        'STATE_MISMATCH',
        'O arquivo ou a conexão não corresponde ao estado de retomada.'
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    state = {
      fileHash,
      size: info.size,
      endpointFingerprint,
      profileId,
      clientRequestId: randomBytes(32).toString('hex'),
    };
    await saveState(statePath, state);
  }
  let progress: Progress;
  if (state.uploadId) {
    progress = await call(client, 'getMediaUploadTool', {
      uploadId: state.uploadId,
    });
  } else {
    let attempts = 0;
    while (!progress) {
      try {
        progress = await call(client, 'beginMediaUploadTool', {
          filename: basename(filePath),
          size: info.size,
          sha256: fileHash,
          clientRequestId: state.clientRequestId,
        });
      } catch (error) {
        if (
          !(error instanceof UploadClientError) ||
          error.code !== 'TRANSPORT_FAILED' ||
          ++attempts >= 3
        )
          throw error;
        await delay(attempts * 1000);
      }
    }
    state.uploadId = progress.uploadId;
    await saveState(statePath, state);
  }
  const assertState = (): void => {
    if (progress.state === 'unknown' || progress.state === 'committing')
      return failure(
        'UPLOAD_RESULT_UNKNOWN',
        'Conclusão pendente ou incerta. Consulte andamento e biblioteca antes de outra transferência.'
      );
    if (
      progress.offset > info.size ||
      !['receiving', 'completed'].includes(progress.state)
    )
      return failure(
        'INVALID_RESPONSE',
        'O MCP retornou andamento incompatível com o arquivo.'
      );
  };
  assertState();
  const file = await open(filePath, 'r');
  try {
    while (progress.state === 'receiving' && progress.offset < info.size) {
      const offset = progress.offset;
      const buffer = Buffer.alloc(
        Math.min(progress.maxChunkBytes, info.size - offset)
      );
      let read = 0;
      while (read < buffer.length) {
        const part = await file.read(
          buffer,
          read,
          buffer.length - read,
          offset + read
        );
        if (!part.bytesRead)
          return failure('FILE_CHANGED', 'O arquivo mudou durante o envio.');
        read += part.bytesRead;
      }
      const expected = offset + buffer.length;
      let attempts = 0;
      for (;;) {
        try {
          progress = await call(client, 'appendMediaUploadTool', {
            uploadId: state.uploadId,
            offset,
            base64: buffer.toString('base64'),
          });
        } catch (error) {
          if (
            !(error instanceof UploadClientError) ||
            !['TRANSPORT_FAILED', 'UPLOAD_BUSY'].includes(error.code) ||
            ++attempts >= 3
          )
            throw error;
          await delay(attempts * 1000);
          progress = await call(client, 'getMediaUploadTool', {
            uploadId: state.uploadId,
          });
        }
        assertState();
        if (progress.offset === expected) break;
        if (progress.offset !== offset || ++attempts >= 3)
          return failure(
            'OFFSET_MISMATCH',
            'O offset do servidor mudou inesperadamente. Consulte o andamento antes de retomar.'
          );
      }
    }
  } finally {
    await file.close();
  }
  if (progress.state !== 'completed') {
    try {
      progress = await call(client, 'completeMediaUploadTool', {
        uploadId: state.uploadId,
      });
    } catch (error) {
      if (
        !(error instanceof UploadClientError) ||
        error.code !== 'TRANSPORT_FAILED'
      )
        throw error;
      progress = await call(client, 'getMediaUploadTool', {
        uploadId: state.uploadId,
      });
    }
  }
  if (
    progress.state !== 'completed' ||
    !progress.media?.id ||
    !progress.media?.path
  )
    return failure(
      'UPLOAD_RESULT_UNKNOWN',
      'Conclusão pendente ou incerta. Consulte andamento e biblioteca antes de outra transferência.'
    );
  await rm(statePath, { force: true });
  return progress.media;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const selector = args.indexOf('--profile');
  const profileId =
    selector >= 0 ? args[selector + 1] : process.env.MCP_PROFILE_ID;
  if (selector >= 0 && (!profileId || profileId.startsWith('--')))
    failure('PROFILE_REQUIRED', 'Informe o ID do perfil depois de --profile.');
  if (selector >= 0) args.splice(selector, 2);
  const file = args[0];
  const url = process.env.MCP_URL;
  const token = process.env.MCP_TOKEN || process.env.API_KEY;
  if (!file || !url || !token)
    return failure(
      'CONFIG_REQUIRED',
      'Informe o arquivo e configure MCP_URL e MCP_TOKEN no arquivo privado de ambiente.'
    );
  const endpoint = new URL(url);
  if (
    endpoint.protocol !== 'https:' &&
    !(
      endpoint.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    )
  )
    return failure(
      'HTTPS_REQUIRED',
      'Use HTTPS para enviar credenciais e mídia ao MCP.'
    );
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  );
  const client = new Client({
    name: 'multipost-media-upload',
    version: '1.0.0',
  });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      })
    );
    const adapter: ToolClient = {
      callTool: (input) =>
        client.callTool(input, undefined, { timeout: 15 * 60_000 }),
    };
    const fingerprint = createHash('sha256')
      .update(url)
      .update('\0')
      .update(token)
      .digest('hex');
    const result = await transferLocalMedia(
      adapter,
      file,
      args[1] || `${file}.multipost-upload.json`,
      fingerprint,
      sleep,
      profileId
    );
    console.log(JSON.stringify({ media: result }));
  } finally {
    await client.close();
  }
}
if (require.main === module)
  void main().catch((error) => {
    console.error(
      error instanceof UploadClientError
        ? error.message
        : 'Não foi possível concluir o envio. Confira o arquivo, a conexão e o estado de retomada.'
    );
    process.exitCode = 1;
  });
