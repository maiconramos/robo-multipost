import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Hosts privados/local-only que NUNCA podem virar destino de um botao de DM
 * enviado ao Instagram. O botao e renderizado pelo app do Instagram e clicado
 * pelo usuario final — uma URL maliciosa vira phishing / scheme-injection, e
 * um host interno vira SSRF caso algum consumidor futuro faca fetch dela.
 *
 * A lista espelha PRIVATE_HOST_PATTERNS de ai-web-search.service.ts, mas esta
 * regra e PROPOSITALMENTE mais estrita: exige `https:` (aquela aceita http
 * porque e fetch server-side de busca; aqui e link publico para o usuario) e
 * bloqueia tambem dominios `.local`/`.internal`.
 */
export const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./, // 127.0.0.0/8
  /^10\./, // 10.0.0.0/8
  /^192\.168\./, // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^169\.254\./, // link-local
  /^0\./, // 0.0.0.0/8
  /^::1$/, // IPv6 loopback
  /^fe80:/i, // IPv6 link-local
  /^fc00:/i, // IPv6 unique local
  /^fd00:/i, // IPv6 unique local
  /^::ffff:/i, // IPv4-mapped IPv6 (ex.: ::ffff:127.0.0.1)
  /\.local$/i,
  /\.internal$/i,
];

/**
 * Valida que `raw` e uma URL https publica. Retorna `null` quando valida ou
 * uma mensagem de erro (string) quando invalida. Nao lanca — quem chama decide
 * como reportar (decorator class-validator ou throw no service).
 */
export function checkPublicHttpsUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'URL invalida';
  }
  if (parsed.protocol !== 'https:') {
    return 'A URL do botao precisa usar https://';
  }
  // hostname de IPv6 vem entre colchetes (ex.: "[::1]") — removemos para casar
  // com os padroes de loopback/link-local.
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) {
    return 'URL invalida';
  }
  // IP codificado em decimal (ex.: 2130706433 == 127.0.0.1) ou hex/octal
  // (ex.: 0x7f000001) — nunca e um dominio publico valido. Bloqueia bypass
  // de SSRF caso a URL venha a ser buscada server-side no futuro.
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return `Host numerico nao permitido na URL do botao: ${host}`;
  }
  for (const pattern of PRIVATE_HOST_PATTERNS) {
    if (pattern.test(host)) {
      return `Host nao permitido na URL do botao: ${host}`;
    }
  }
  return null;
}

export function isPublicHttpsUrl(raw: unknown): boolean {
  return typeof raw === 'string' && checkPublicHttpsUrl(raw) === null;
}

@ValidatorConstraint({ name: 'isPublicHttpsUrl', async: false })
export class IsPublicHttpsUrlConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    // Campo opcional: ausencia e valida; presenca deve passar na regra.
    if (value === undefined || value === null || value === '') {
      return true;
    }
    return isPublicHttpsUrl(value);
  }

  defaultMessage(): string {
    return 'dmButtonUrl deve ser uma URL https publica valida (sem hosts privados/locais e sem esquemas como javascript:/data:/file:)';
  }
}

/**
 * Decorator class-validator. Uso: `@IsPublicHttpsUrl() dmButtonUrl?: string`.
 * Cobre o caminho REST/SDK (fail-fast no ValidationPipe + documentacao Swagger).
 * O service revalida via `checkPublicHttpsUrl` para cobrir tambem MCP e wizard.
 */
export function IsPublicHttpsUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPublicHttpsUrlConstraint,
    });
  };
}
