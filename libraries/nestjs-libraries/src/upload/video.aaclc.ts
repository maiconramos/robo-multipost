import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Diagnostico que motivou este modulo
 * --------------------------------------------------------------------
 * Reposts de videos do Instagram para o Threads falhavam consistentemente
 * com `status=ERROR` + `error_message=UNKNOWN` retornado pela Graph API.
 * O mesmo vídeo postado manualmente (arquivo original 4K do usuário)
 * publicava normal. A unica diferenca relevante entre os 2 arquivos era
 * o codec de audio:
 *   - IG-CDN re-encoda o audio para HE-AAC (mais eficiente, ~55kbps).
 *   - Meta Threads/Reels aceita SOMENTE AAC-LC (a especificacao oficial
 *     diz "AAC" mas na pratica HE-AAC e rejeitado sem mensagem).
 * O upload manual mantinha AAC-LC (perfil padrao da maioria dos
 * encoders), por isso publicava.
 *
 * Solucao: detectar o perfil de audio e, se for HE-AAC (ou outro alem
 * de LC), transcodar pra AAC-LC mantendo o video em copy (rapido).
 *
 * Custo: ~1-3s para video curto (Story/Reel ate 90s) usando -c:v copy.
 * Apenas o audio passa pelo encoder, o que e barato.
 *
 * Disponibilidade: ffmpeg precisa estar instalado no container. O
 * Dockerfile.dev ja inclui via apt-get install ffmpeg.
 */

const FFPROBE = process.env.FFPROBE_BIN || 'ffprobe';
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';

interface AudioInfo {
  codec: string;
  profile: string;
}

async function probeAudio(path: string): Promise<AudioInfo | null> {
  return new Promise((resolve) => {
    const ff = spawn(FFPROBE, [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,profile',
      '-of',
      'json',
      path,
    ]);
    let out = '';
    ff.stdout.on('data', (c) => (out += c.toString()));
    ff.on('error', () => resolve(null));
    ff.on('close', () => {
      try {
        const json = JSON.parse(out || '{}');
        const stream = json?.streams?.[0];
        if (!stream) return resolve(null);
        resolve({
          codec: String(stream.codec_name || '').toLowerCase(),
          profile: String(stream.profile || '').toUpperCase(),
        });
      } catch {
        resolve(null);
      }
    });
  });
}

async function transcodeAudioToAacLc(
  inputPath: string,
  outputPath: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ff = spawn(FFMPEG, [
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-profile:a',
      'aac_low',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
    let stderr = '';
    ff.stderr.on('data', (c) => (stderr += c.toString()));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${stderr}`));
      resolve();
    });
  });
}

/**
 * Garante que o video em `buffer` tem audio AAC-LC. Se o audio ja for LC
 * (caso comum em vídeos gravados pelo proprio usuario), retorna o buffer
 * original sem rodar ffmpeg. Se for HE-AAC, MP3, ou qualquer outro perfil,
 * transcoda pra AAC-LC com -c:v copy (rapido).
 *
 * Falhas no probe ou transcode retornam o buffer original — fail-open
 * pra nao quebrar uploads que nao deveriam falhar (ex.: ffmpeg ausente
 * em ambientes que nao precisam dessa correcao).
 */
export async function ensureAacLcAudio(buffer: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}.in.mp4`);
  const outputPath = join(tmpdir(), `${id}.out.mp4`);

  try {
    await fs.writeFile(inputPath, buffer);

    const info = await probeAudio(inputPath);
    if (!info) {
      console.log('[ensureAacLcAudio] no audio stream detected — skip');
      return buffer;
    }
    if (info.codec === 'aac' && info.profile === 'LC') {
      console.log('[ensureAacLcAudio] already AAC-LC — skip');
      return buffer;
    }

    console.log(
      `[ensureAacLcAudio] transcoding audio ${info.codec}/${info.profile} → aac/LC`
    );
    await transcodeAudioToAacLc(inputPath, outputPath);
    return await fs.readFile(outputPath);
  } catch (err) {
    console.error(
      '[ensureAacLcAudio] transcode failed, returning original buffer:',
      (err as Error).message || err
    );
    return buffer;
  } finally {
    await fs.unlink(inputPath).catch(() => undefined);
    await fs.unlink(outputPath).catch(() => undefined);
  }
}
