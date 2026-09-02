import { realpathSync, statSync } from 'fs';
import { resolve, sep } from 'path';

const isInside = (base: string, candidate: string) =>
  candidate === base || candidate.startsWith(base + sep);

const decodePathSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Resolve um arquivo servido pela rota /uploads sem permitir que segmentos
 * controlados pelo cliente escapem de UPLOAD_DIRECTORY.
 *
 * Ha duas verificacoes intencionais:
 * - confinamento lexical, que bloqueia `..`, caminhos absolutos e prefixos
 *   irmaos parecidos;
 * - confinamento do caminho real, que tambem bloqueia symlinks para fora.
 */
export const resolveSafeUploadFile = (
  uploadDirectory: string,
  pathSegments: string[]
): string | null => {
  const base = resolve(uploadDirectory);
  const requested = pathSegments.map(decodePathSegment).join(sep);
  const candidate = resolve(base, requested);

  if (!isInside(base, candidate)) {
    return null;
  }

  try {
    const realBase = realpathSync(base);
    const realCandidate = realpathSync(candidate);

    if (!isInside(realBase, realCandidate)) {
      return null;
    }

    if (!statSync(realCandidate).isFile()) {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
};
