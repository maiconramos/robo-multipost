import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { URL } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

export function isSsrfProtectionDisabled(): boolean {
  return process.env.DISABLE_SSRF_PROTECTION === 'true';
}

export function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function isBlockedIPv4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number);

  if ([a, b, c].some((n) => Number.isNaN(n))) return true;

  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8
    (a === 169 && b === 254) || // 169.254.0.0/16
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // documentation TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // deprecated 6to4 relay anycast
    (a === 198 && b === 51 && c === 100) || // documentation TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // documentation TEST-NET-3
    a >= 224 // multicast/reserved
  );
}

function expandIPv6(ip: string): number[] | undefined {
  let normalized = ip.toLowerCase().split('%')[0];

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4 = normalized.slice(lastColon + 1);
    if (net.isIP(ipv4) !== 4) {
      return undefined;
    }

    const bytes = ipv4.split('.').map(Number);
    normalized = `${normalized.slice(0, lastColon)}:${(
      (bytes[0] << 8) |
      bytes[1]
    ).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) {
    return undefined;
  }

  const left = halves[0]
    ? halves[0].split(':').map((part) => Number.parseInt(part, 16))
    : [];
  const right = halves[1]
    ? halves[1].split(':').map((part) => Number.parseInt(part, 16))
    : [];
  const missing = 8 - left.length - right.length;

  if (
    missing < 0 ||
    (halves.length === 1 && missing !== 0) ||
    [...left, ...right].some(
      (part) => Number.isNaN(part) || part < 0 || part > 0xffff
    )
  ) {
    return undefined;
  }

  return [...left, ...Array(missing).fill(0), ...right];
}

export function isBlockedIPv6(ip: string): boolean {
  const parts = expandIPv6(ip);
  if (!parts) {
    return true;
  }

  const first = parts[0];
  const isUnspecifiedOrIpv4Compatible = parts
    .slice(0, 6)
    .every((part) => part === 0);
  const isIpv4Mapped =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  const isWellKnownNat64 =
    first === 0x0064 &&
    parts[1] === 0xff9b &&
    parts.slice(2, 6).every((part) => part === 0);
  const isLocalNat64 =
    first === 0x0064 && parts[1] === 0xff9b && parts[2] === 0x0001;

  if (isIpv4Mapped) {
    const mapped = `${parts[6] >> 8}.${parts[6] & 0xff}.${parts[7] >> 8}.${
      parts[7] & 0xff
    }`;
    return isBlockedIPv4(mapped);
  }

  return (
    isUnspecifiedOrIpv4Compatible || // ::/96, incluindo :: e ::1
    (first & 0xfe00) === 0xfc00 || // unique-local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local legado fec0::/10
    (first & 0xff00) === 0xff00 || // multicast ff00::/8
    isWellKnownNat64 || // 64:ff9b::/96 pode traduzir para IPv4 privado
    isLocalNat64 || // 64:ff9b:1::/48 e reservado para NAT64 local
    first === 0x2002 || // 6to4 pode encapsular IPv4 privado
    (first === 0x2001 && parts[1] === 0x0000) || // Teredo encapsula IPv4
    (first === 0x2001 && parts[1] === 0x0db8) // documentacao 2001:db8::/32
  );
}

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIPv4(ip);
  }
  if (version === 6) {
    return isBlockedIPv6(ip);
  }
  return true;
}

export async function isSafePublicHttpsUrl(value: unknown): Promise<boolean> {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }

  if (!parsed.hostname) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (hostname === 'localhost') {
    return false;
  }

  // If user supplied a literal IP directly, validate it immediately
  const literalIpVersion = net.isIP(hostname);
  if (literalIpVersion) {
    return !isBlockedIp(hostname);
  }

  try {
    const records = await dns.lookup(hostname, { all: true });

    if (!records.length) {
      return false;
    }

    for (const record of records) {
      if (isBlockedIp(record.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

@ValidatorConstraint({ name: 'IsSafeWebhookUrl', async: true })
export class IsSafeWebhookUrlConstraint
  implements ValidatorConstraintInterface
{
  async validate(value: unknown, args: ValidationArguments): Promise<boolean> {
    const allowPrivateNetworkOptOut = args.constraints?.[0] === true;
    if (allowPrivateNetworkOptOut && isSsrfProtectionDisabled()) {
      return isHttpsUrl(value);
    }

    return isSafePublicHttpsUrl(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'URL must be a public HTTPS URL and must not resolve to localhost, private, loopback, or link-local addresses';
  }
}

export function IsSafeWebhookUrl(
  validationOptions?: ValidationOptions,
  settings: { allowPrivateNetworkOptOut?: boolean } = {}
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [settings.allowPrivateNetworkOptOut === true],
      validator: IsSafeWebhookUrlConstraint,
    });
  };
}
