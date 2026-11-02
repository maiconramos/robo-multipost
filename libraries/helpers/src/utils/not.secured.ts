/**
 * `NOT_SECURED` liga o modo sem HTTPS (cookie sem Secure/HttpOnly, token
 * tambem no header `auth`). O codigo antigo testava so se a variavel existia,
 * entao `NOT_SECURED: "false"` (como nos templates de instalacao) LIGAVA o
 * modo inseguro: o cookie de login ficava legivel por JavaScript. So valores
 * explicitos de "ligado" contam.
 */
export const isNotSecured = (
  value: string | undefined = process.env.NOT_SECURED
): boolean => /^(true|1|yes|on)$/i.test((value ?? '').trim());
