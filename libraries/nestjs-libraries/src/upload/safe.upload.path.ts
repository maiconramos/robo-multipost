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

/**
 * Extrai os segmentos de caminho de uma URL publica servida pela rota
 * `/uploads` (`https://host/uploads/2026/09/07/arquivo.png` ou
 * `/uploads/2026/09/07/arquivo.png`) para alimentar `resolveSafeUploadFile`.
 *
 * Retorna `[]` quando a URL nao aponta para a rota `/uploads` deste
 * self-hosted — nesse caso nao existe arquivo local correspondente e o
 * chamador nao deve tentar remover nada.
 */
export const extractUploadPathSegments = (publicPath: string): string[] => {
  if (!publicPath) {
    return [];
  }

  const withoutQuery = publicPath.split('?')[0].split('#')[0];
  let pathname = withoutQuery;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withoutQuery)) {
    try {
      pathname = new URL(withoutQuery).pathname;
    } catch {
      return [];
    }
  }

  const marker = '/uploads/';
  const index = pathname.indexOf(marker);
  if (index === -1) {
    return [];
  }

  return pathname
    .slice(index + marker.length)
    .split('/')
    .filter(Boolean);
};
