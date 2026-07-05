const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Gera um identificador aleatorio NAO seguro (usa `Math.random()`).
 *
 * Livre de `crypto` de proposito: pode ser importado por codigo de workflow
 * do Temporal (o bundler de workflows rejeita `crypto`). Use apenas para
 * valores que NAO sao segredos (ex.: sufixo de `workflowId`). Para segredos
 * ou credenciais, use `makeSecureId` de `make.secure.id.ts`.
 */
export const makeId = (length: number) => {
  let text = '';
  const possible = ALPHABET;

  for (let i = 0; i < length; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};
