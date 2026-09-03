# Auditoria de dependências de segurança — setembro de 2026

> Base do fork: `1be86776` (`main`, após o tratamento de falhas Kie.ai)
> Upstream: `8d23e5ed` e `7a02bd6b`

## Escopo

Portar os bumps de framework e segurança sem substituir o lockfile do fork nem
reverter seus overrides. A mudança cobre Next/Nest, transporte HTTP, parsing,
upload por multipart, detecção por magic bytes e o toolchain da extensão. Não
altera schema, providers, OAuth, Meta Graph, perfis, storage ou workflows
Temporal.

## Diagnóstico antes do porte

O manifesto ainda declarava várias versões antigas, embora parte delas já
estivesse corrigida em runtime por `pnpm.overrides`. A árvore efetiva tinha,
entre outros, Next `16.2.6`, Axios `1.16.0`, Multer `2.1.1`,
`fast-xml-parser` `5.5.10`, `file-type` `16.5.4`, Vite `6.4.1` e PostCSS
`8.4.38`.

A consulta por versão à GitHub Advisory Database confirmou vulnerabilidades
ainda aplicáveis nessa baseline, incluindo:

- Next `16.2.6`: SSRF/bypass/DoS corrigidos na linha posterior;
- Axios `1.16.0`: falhas de prototype pollution, proxy e limites de upload;
- Multer `2.1.1`: DoS por campos profundamente aninhados e limpeza incompleta;
- `fast-xml-parser` `5.5.10`: injeção em comentários/CDATA do XMLBuilder;
- `file-type` `16.5.4`: loop infinito no parser ASF (`GHSA-5v7r-6r5c-r473`);
- Vite `6.4.1` e PostCSS `8.4.38`: leitura indevida/path traversal em
  superfícies de desenvolvimento/build.

## Adaptação aplicada

### Framework e runtime

- Next passa a `16.3.1` e Nest declara os mínimos `11.1.21` já adotados pelo
  upstream; o lockfile resolve os patches/minors compatíveis atuais;
- o runtime suportado continua restrito a Node 22, e o Volta passa de Node
  `20.17.0` para `22.12.0`, alinhado a `engines`, CI e `file-type` 22;
- `@types/node` acompanha Node `22.12.0`;
- o pacote não utilizado `@tailwindcss/vite` foi removido, pois seu peer range
  não aceita Vite 8 e nenhuma configuração do repositório o importava.

### Dependências de segurança

O manifesto passa a declarar as linhas corrigidas do upstream para Axios,
`fast-xml-parser`, Multer, `music-metadata`, PostCSS, Vite,
`@vitejs/plugin-react` e `@crxjs/vite-plugin`. O lockfile foi regenerado sobre o
fork com pnpm `10.6.1`; seus overrides de segurança anteriores foram mantidos.
Multer agora possui override global para evitar que dependências transitivas
reintroduzam uma linha vulnerável.

### `file-type` sem duplicar a validação de upload

O upstream alterou seis consumidores separadamente. O fork já centraliza a
allowlist em `allowed.upload.mime.ts`, então somente esse chokepoint foi migrado
de `fromBuffer` para `fileTypeFromBuffer`. A lista continua aceitando apenas os
formatos binários já autorizados; SVG/HTML permanecem rejeitados, e as
proteções de tamanho, perfil e SSRF/DNS-pinning não foram tocadas.

`file-type` 22 é ESM e requer Node 22. O backend compilado é CommonJS, mas seu
comando de produção já usa `--experimental-require-module`. Foi adicionado um
teste de processo real com o mesmo flag e uma imagem PNG válida; specs Jest que
isolam a regra usam mock explícito da API atual, pois o runtime próprio do Jest
não transforma ESM dentro de `node_modules`.

## Itens deliberadamente não misturados

- `eslint-config-next`/ESLint 9: o repositório ainda tem uma migração de lint
  independente e não possui lint no gate atual;
- pares antigos de Vitest UI/coverage e outros warnings preexistentes: exigem
  PR próprio, pois não participam dos builds/testes desta aplicação;
- código de upload duplicado do upstream: incompatível com o helper central do
  fork;
- pacote/lockfile do upstream copiado integralmente: descartado para preservar
  dependências e overrides exclusivos do Robô MultiPost.

## Evidência

O ciclo RED reproduziu o contrato antigo de `file-type`: o novo teste falhou
porque `fromBuffer` não existe no mock da API v22. Após a adaptação, três suítes
dirigidas de upload passaram (17 testes), incluindo allowlist, falso MIME e o
carregamento real do pacote ESM por Node 22.

Também passaram:

- 94 suítes/926 testes das bibliotecas;
- 16 suítes/131 testes do backend;
- builds de frontend, backend, orchestrator e extensão;
- execução do helper compilado contra um PNG real;
- instalação offline com `pnpm install --frozen-lockfile --ignore-scripts`.

A API de advisories não retornou vulnerabilidade aplicável às versões diretas
resolvidas após o porte. Isso não equivale a uma auditoria limpa de toda a
árvore transitiva: `pnpm audit --json` excedeu o heap de 4 GiB neste monorepo.
Dependabot e o CI continuam sendo os gates complementares da árvore completa.

Não há alteração visual. O smoke de pré-release deve subir os quatro processos,
abrir o frontend, enviar um PNG válido e um SVG disfarçado, e carregar a
extensão gerada antes da promoção para `release`.
