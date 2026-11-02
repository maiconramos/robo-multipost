// Mock leve do isomorphic-dompurify para o jest.
//
// O pacote real e dual-package mas sua cadeia em runtime carrega jsdom ->
// @exodus/bytes (ESM), que o ts-jest (transform so de .tsx?) nao consegue
// parsear ao importar DTOs de post em specs ("Unexpected token export").
// O backend/frontend usam o build CJS de verdade em runtime; a sanitizacao
// real e verificada nos specs vitest do frontend
// (apps/frontend/src/components/new-launch/*sanitize*.spec.ts). Specs que
// importam create.post.dto (via posts.service etc.) so precisam que o modulo
// carregue — entao devolvemos uma sanitize identidade e hooks no-op.
const sanitize = (value) => (typeof value === 'string' ? value : '');
const addHook = () => undefined;
const removeHook = () => undefined;
const api = { sanitize, addHook, removeHook };
module.exports = { ...api, default: api };
