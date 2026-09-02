export type ParsedHttpByteRange =
  | {
      partial: boolean;
      start: number;
      end: number;
      length: number;
    }
  | { unsatisfiable: true };

const UNSATISFIABLE = { unsatisfiable: true } as const;

/**
 * Parse one RFC 7233 byte range. Multipart ranges are intentionally rejected:
 * the upload endpoint only needs a single bounded window for media streaming.
 */
export function parseHttpByteRange(
  rangeHeader: string | null,
  size: number
): ParsedHttpByteRange {
  if (!Number.isSafeInteger(size) || size < 0) {
    return UNSATISFIABLE;
  }

  if (!rangeHeader) {
    return {
      partial: false,
      start: 0,
      end: size - 1,
      length: size,
    };
  }

  if (size === 0 || rangeHeader.includes(',')) {
    return UNSATISFIABLE;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    return UNSATISFIABLE;
  }

  let start: number;
  let end: number;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return UNSATISFIABLE;
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start >= size ||
      end < start
    ) {
      return UNSATISFIABLE;
    }
    end = Math.min(end, size - 1);
  }

  return {
    partial: true,
    start,
    end,
    length: end - start + 1,
  };
}
