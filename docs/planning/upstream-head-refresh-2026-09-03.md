# Atualização da triagem upstream — 03/09/2026

## Fotografia

- tag estável mais recente: `v2.23.0` (`1e4c8dd5`);
- cabeça anterior auditada: `ec162d2a`;
- cabeça atual de `upstream/main`: `36d5fc7b`;
- três commits efetivos novos e dois merges desde a cabeça anterior;
- espelho `postiz` do fork: `db1a49e2`, 13 commits totais atrás da cabeça
  atual — 11 sem merge, incluindo oito ajustes do workflow staging do upstream.

Não houve nova versão estável. Portanto, os itens abaixo permanecem watchlist
e não justificam sincronizar o upstream inteiro.

## Classificação dos commits novos

### `3e6206f7` — post workflow V1.1.2

Adiciona retry para heartbeat timeout sem detalhes, mas o arquivo novo replica
mais de 700 linhas do pipeline de publicação recente. O fork ainda registra
`postWorkflowV102`, com históricos reais, exclusão de perfil, tokens
criptografados, reconexão/self-heal Meta e providers divergentes.

**Decisão:** incluir no épico Temporal. Não fazer cherry-pick. A migração exige
ADR, manutenção do executor V102 para históricos, replay e smoke de publicação
antes de alterar o workflow iniciado por `PostsService`.

### `4f296fc0` — better onboarding

Reescreve o modal de onboarding e grande parte da tela de API pública/MCP,
incluindo um catálogo extenso de clientes. Esses componentes se sobrepõem ao
branding, traduções, chaves por perfil e contratos MCP próprios do Multipost.
O commit também adiciona texto somente ao catálogo inglês do upstream.

**Decisão:** não portar como atualização técnica. Pode ser reavaliado como
feature de produto em PR própria, começando por requisitos de onboarding,
paridade pt-BR/en e validação de escopo por perfil.

### `c9382d98` — other agents

Amplia o onboarding anterior com mais clientes/agentes e ícones de terceiros.
Depende diretamente de `4f296fc0` e não corrige falha do fork.

**Decisão:** não portar isoladamente. Reavaliar apenas junto da eventual feature
de onboarding, incluindo origem/licença dos assets e o modelo de conexão MCP do
fork.

## Correção de item anterior

O commit `7edeadd5` de Facebook Story não está mais pendente. A adaptação já
entrou na migração Meta Graph v25: o provider aceita `upload_complete` ou
`ready`, falha explicitamente em erro/timeout e só então executa `finish`. Os
testes cobrem sucesso e rejeição. Criar outra PR de código duplicaria o
comportamento já validado.

## Próximo passo seguro

Com os P0/P1 aceitos incorporados, o próximo bloco de engenharia é preparar o
ADR do pipeline Temporal V102 → versão adaptada. O ADR deve congelar o contrato
de compatibilidade antes de qualquer implementação e definir:

1. coexistência e registro das versões antigas e nova;
2. estratégia de replay com históricos representativos;
3. idempotência e prevenção de publicação duplicada;
4. preservação de perfil cancelado, aprovação, posts recorrentes e tokens
   criptografados;
5. comportamento de erro Meta e self-heal por Usuário do Sistema;
6. rollback e gate de prerelease com publicação real controlada.
