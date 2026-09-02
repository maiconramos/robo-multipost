# Auditoria e porte cirúrgico do Google Meu Negócio — setembro de 2026

> Branch: `codex/upstream-google-business-provider`  
> Base do fork: `26d7130a` (`main`, após o porte do Pinterest)  
> Upstream conferido: `ec162d2a` em 02/09/2026  
> Estado: implementado com testes automatizados; smoke test real pendente

## Objetivo

Impedir que o calendário registre como publicada uma atualização que o Google
rejeitou ou não confirmou, preservando as credenciais por perfil e o fluxo de
renovação próprio do Robô MultiPost.

## Alterações adotadas

| Origem                       | Decisão no fork                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `f700b8a1`                   | Uma resposta HTTP bem-sucedida com `state: REJECTED` agora vira `BadBody` não retentável. Respostas sem `name` também deixam de produzir um falso sucesso com `postId` vazio.                                                                                                                                                                                                           |
| `1d965049`                   | Corpo vazio ou não JSON é tratado como criação não confirmada, com a mesma mensagem acionável, em vez de escapar como `SyntaxError` genérico.                                                                                                                                                                                                                                           |
| Compatibilidade do fork      | `generateAuthUrl`, `authenticate` e `refreshToken` passam a usar o `ClientInformation` do perfil. O identificador `gmb` reutiliza a credencial `youtube`, pois ambos pertencem ao mesmo app Google mostrado em Configurações > Credenciais. As variáveis `GOOGLE_GMB_CLIENT_ID/SECRET` e o fallback legado `YOUTUBE_CLIENT_ID/SECRET` continuam válidos quando não há credencial salva. |
| Compatibilidade do reconnect | O provider declara `keepReconnectAuthTokens`, força um consentimento não incremental e tenta revogar o access token antigo antes da reconexão. Assim o callback conserva o novo `refresh_token` e a expiração real, em vez de o canal funcionar por cerca de uma hora e cair novamente.                                                                                                 |

## Já coberto antes desta PR

- paginação de contas e localizações;
- validação no editor de uma única imagem e proibição de vídeo;
- tratamento compartilhado de HTTP, refresh, retry e payload inválido pelo
  `SocialAbstract`;
- provider alternativo `zernio-googlebusiness`, que permanece inalterado.

## Alterações deliberadamente não adotadas

- `1b53973e`: transfere a validação de mídia de todos os providers para o
  servidor e altera 55 arquivos. O GMB mantém a validação existente no editor
  até esse contrato global ser auditado separadamente.
- `49aa92ac`: não foi aplicado como commit global. O fork já possui a política
  condicional `keepReconnectAuthTokens`, criptografia de tokens, perfis e
  observabilidade próprias; foi adotada apenas a parte necessária no GMB.
- `060b14db`: altera globalmente quando uma falha de refresh desconecta canais.
  Esse caminho precisa de uma PR própria porque o fork contém self-heal Meta,
  `StatusEvent` e regras para providers sem refresh nativo.
- O novo pipeline de publicação Temporal não foi trazido. A resposta do GMB
  continua compatível com os workflows atuais.

## Cobertura e gate de produção

Os testes automatizados cobrem `REJECTED`, JSON sem identificador, corpo não
JSON, sucesso confirmado, as três fases de OAuth por perfil, preservação dos
tokens no reconnect, revogação segura e o alias GMB para a credencial Google.

Antes de promover para produção ainda é obrigatório:

1. cadastrar também `/integrations/social/gmb` nas URIs autorizadas do app
   Google usado pelo card YouTube / Google;
2. conectar uma localização usando somente a credencial salva no perfil;
3. publicar texto e uma publicação com imagem;
4. reconectar a mesma localização e confirmar no banco que o `refreshToken`
   continuou preenchido e a expiração ficou próxima de uma hora;
5. executar ou aguardar a renovação do token e publicar novamente.
