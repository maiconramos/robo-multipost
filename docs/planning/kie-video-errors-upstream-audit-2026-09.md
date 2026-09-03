# Auditoria de falhas de vídeo Kie.ai — setembro de 2026

> Base do fork: `678444ad` (`main`, após o stream do gerador)
> Upstream: `b12c03f3`, `9ef99bc4` e `88008142`

## Escopo

Evitar que uma geração Seedance/Veo permaneça consultando depois que a Kie.ai
já registrou rejeição, limitar sockets travados, tornar a falha correlacionável
e permitir que a ferramenta do agente encerre o turno. Esta PR não muda modelo,
payload de geração, preço, limite de crédito, storage, UI ou Temporal.

## Estado do fork antes do porte

O upstream corrigiu um loop sem limite em `videos/veo3/veo3.ts`. Essa classe já
foi removida deste fork: Kie.ai vive em `AiVideoService`, com credencial
workspace/perfil, Seedance e Veo, polling de 20 iterações e upload próprio.

O fork também já tinha:

- timeout lógico depois de 20 polls;
- erro para `successFlag=2/3` e sucesso sem URL;
- tratamento 502/504 e `finally` no modal REST;
- `MediaService.generateAiVideo` envolvendo provider e upload em `useCredit`;
- exclusão compensatória do débito quando o callback de `useCredit` rejeita.

Logo, copiar os commits ou a UI do upstream substituiria arquitetura local e
duplicaria proteções existentes.

## Adaptação aplicada

### Transporte e estados

- criação e `recordInfo` usam `AbortSignal.timeout(30_000)`;
- apenas `successFlag=0` continua o polling;
- `successFlag=1` sem URL continua sendo erro;
- estados `2`, `3`, desconhecidos ou ausentes falham imediatamente;
- `code` de erro dentro de HTTP 200 também falha imediatamente;
- o `taskId` retornado é registrado pelo logger do Nest.

Falha HTTP de criação tenta extrair `code`/`msg` do JSON. Mensagens úteis são
mantidas, mas passam por limite de 500 caracteres e remoção de Bearer token e
da API key efetivamente resolvida. Corpo não estruturado não é devolvido.

Erros HTTP/transientes no polling continuam tolerados até o limite já existente;
o novo timeout impede que uma única chamada de rede fique aberta para sempre.

### Ferramenta do agente

`generateVideoTool` mantém organização e perfil vindos do request context. A
chamada agora captura `HttpException` após o `useCredit` já ter tratado a
rejeição e devolve `{ error }`; exceções inesperadas recebem texto genérico sem
detalhes. Assim Mastra consegue fechar o stream e persistir o turno em vez de
perder a aprovação do usuário.

## Itens deliberadamente não copiados

- `libraries/nestjs-libraries/src/videos/veo3/veo3.ts`: não existe mais;
- mudança em `ai.video.tsx`: a UI do fork já checa `response.ok`, mostra o texto
  do backend para 412/402/429/504/502 e libera os três estados no `finally`;
- pipeline de vídeo assíncrono/webhook posterior do upstream: fora desta PR;
- afirmação nova de reembolso: a compensação já existe e continua em
  `SubscriptionRepository.useCredit`; esta PR apenas garante que falhas
  terminais realmente rejeitem o callback.

## Evidência TDD

RED reproduziu:

- ausência de signal nos dois fetches;
- mensagem assíncrona descartada;
- `code` e `successFlag` desconhecido continuando até outra falha/timeout;
- mensagem HTTP inicial opaca;
- falta de log do `taskId`;
- exceção da tool escapando, incluindo detalhe inesperado sensível.

GREEN cobre 25 testes dirigidos em `ai-video.service.spec.ts` e
`generate.video.tool.spec.ts`, incluindo perfil preservado, schema de sucesso ou
erro, remoção da API key de log/resposta e falha imediata com apenas duas
chamadas (create + primeiro poll terminal).

As suítes completas também passaram: 93 suítes/923 testes das bibliotecas e 16
suítes/131 testes do backend. Os builds de frontend, backend e orchestrator
foram concluídos.

O teste já existente de `SubscriptionRepository.useCredit` confirma que o
registro de crédito é excluído quando o callback rejeita. Geração real não foi
executada para não consumir crédito externo; o smoke de pré-release deve testar
um sucesso e uma rejeição de moderação e correlacionar o `taskId` no painel Kie.
