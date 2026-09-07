const MAX_PENDING_STATE_BYTES = 64 * 1024;

const isCredentialField = (key: string): boolean => {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (
    normalized === 'authorization' ||
    normalized === 'cookie' ||
    normalized === 'apikey' ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password')
  );
};

const assertNoCredentialFields = (
  value: unknown,
  seen: WeakSet<object>
): void => {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (seen.has(value)) {
    throw new Error('Pending post state must be JSON serializable');
  }
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (isCredentialField(key)) {
      throw new Error(
        'Pending post state contains a forbidden credential field'
      );
    }
    assertNoCredentialFields(child, seen);
  }

  seen.delete(value);
};

export const assertSafePendingData = <T>(value: T): T => {
  assertNoCredentialFields(value, new WeakSet());

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('Pending post state must be JSON serializable');
  }

  if (serialized === undefined) {
    throw new Error('Pending post state must be JSON serializable');
  }

  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > MAX_PENDING_STATE_BYTES) {
    throw new Error(
      `Pending post state exceeds ${MAX_PENDING_STATE_BYTES} bytes`
    );
  }

  const normalized = JSON.parse(serialized) as T;
  // Custom toJSON implementations can produce a different object than the one
  // inspected above. Validate the exact JSON snapshot Temporal will persist.
  assertNoCredentialFields(normalized, new WeakSet());
  return normalized;
};
