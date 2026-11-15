# Automações Instagram via Zernio

## Contrato da primeira entrega

A conexão `zernio-instagram` passa a aceitar automações pelo editor rápido, pela fachada REST `/public/v1/automations` e pelas ferramentas MCP existentes. A versão de execução é **3**; versões 1 (Instagram direto) e 2 (compartilhado Meta) permanecem isoladas. O painel usa `/managed-automations` com organização/perfil autenticados.

A regra aceita `platform=instagram`, `triggerType=comment_on_post`, `postMode=all` ou `specific` com um único ID de mídia Instagram. Exige DM; resposta pública é opcional. Aceita até seis textos por ação, com um botão URL compartilhado nas variações. `matchMode=any` significa ocorrência de qualquer palavra-chave (contains no Zernio); `exact` mantém correspondência exata. Lista vazia corresponde a qualquer comentário. O nome do comentarista pode ser usado por `{commenter_name}` (convertido a `{{name}}`).

Campos sem equivalência nesta etapa são recusados com código estável, nunca ignorados: conjunto AND (`all`), botões diferentes por variação, gate de seguidores do motor nativo, aliases, Story, grafo visual, múltiplos posts específicos, agendados e próxima publicação. O Post.id interno e releaseId do Zernio não são IDs de mídia Instagram. As capacidades anunciam os limites, inclusive à IA.

## Execução e isolamento

Flow.executionVersion=3 e envelope versionado em Flow.definition guardam configuração, IDs remotos e estado durável da operação. Não exige schema novo nem utiliza FlowChannel/Temporal nativos. Repositório próprio valida organização, perfil, versão e provider em todas as leituras. A fachada resolve canal e seleciona o motor; não aceita IDs remotos da requisição.

A chave Zernio vem do perfil selecionado; o perfil padrão usa a chave da organização, enquanto perfis secundários só a herdam com shareZernioWithProfiles habilitado. Antes de acessar automação/histórico, confirma-se que a conta remota é Instagram e pertence ao perfil Zernio salvo na integração. IDs dos perfis locais e remotos têm namespaces diferentes.

Rascunho local precede qualquer criação remota. A automação remota é criada pausada, seu ID é persistido e só depois pode ser ativada. Edição/estado usam revisão e reserva CAS. Falha de transporte ou resultado incerto não provoca repetição automática de POST. O recibo preserva o ID local e o estado para inspeção; não afirma que ativou ou salvou remotamente. O nome de criação contém uma correlação com o ID local para permitir recuperação por consulta, sem adoção arbitrária de regras externas. Pausar/arquivar uma regra com vínculo remoto exige confirmar a pausa remota; rascunhos sem vínculo podem ser pausados/arquivados localmente.

A fase create_paused é persistida antes da criação; apply é reservada por CAS antes do PATCH. Operação pending nunca é retomada automaticamente: após queda de processo, um operador precisa confirmar que o escritor terminou e inspecionar o estado remoto. Operação unknown permite apenas recuperação por leitura após 30 segundos. Recuperação confirmada retorna 409 ZERNIO_RECOVERED_RETRY_ACTION, actionApplied=false e nova revisão: a edição ou alteração de estado solicitada ainda deve ser repetida explicitamente.

## Histórico e agentes

`executionVersion=3` nas operações existentes. Histórico retorna o contrato normalizado AutomationExecutionPage/Detail, com cursor associado à regra e aos filtros. Logs são consultados apenas na automação remota vinculada; IDs de execução não dão acesso a outras regras. Estado enviado não comprova leitura; não se inventa conteúdo de mensagens históricas porque o log remoto não oferece snapshot de cada texto/variação.

API autenticada usa os mesmos DTOs e serviço da API pública/MCP; políticas de leitura/escrita e limite de requisições são preservados. Canvas e aliases nativos recusam recursos da versão 3. Nenhuma consulta reenvia mensagens.

## Validação prevista

TDD para mapeamento, limites, escopo, troca de chave/conta, revisão concorrente, timeout e criação pausada, histórico filtrado e cursor, contratos REST/MCP, descoberta/lista/editor. Teste remoto real somente com conta autorizada e regra temporária pausada; ativação e comentários reais precisam de destino de teste definido. Não publicar nem alterar automações existentes durante a validação.

Referências verificadas em 14/11/2026: https://docs.zernio.com/comment-automations/create-comment-automation, https://docs.zernio.com/comment-automations/update-comment-automation, https://docs.zernio.com/comment-automations/list-comment-automation-logs e OpenAPI oficial https://zernio.com/openapi.json.

## Validação realizada

- Domínio, repositórios, fachada, histórico e ferramentas MCP: 188 testes de regressão aprovados em 12 suítes; criação/estado MCP também aprovados na rodada específica.
- HTTP: 11 testes aprovados, com guarda real de perfil, escrita negada para Visualizador e campos de identidade forjados recusados.
- Interface: suíte de 49 arquivos aprovada (347 testes) e regressão adicional do estado vazio aprovada junto dos cinco testes do novo editor. Inclui navegação aguardando a ativação e preservação do mesmo ID após erro.
- TypeScript do frontend/backend sem emissão aprovado. Builds normais de backend e orchestrator aprovados no checkout local; o build com node_modules compartilhado por symlink no worktree apresentou TS2742 em inferências de arquivos existentes, sem reproduzir no checkout normal.
- Navegador Chrome autenticado: entrada Instagram via Zernio, editor rápido reutilizado, estados de validação e indisponibilidade do construtor conferidos no perfil Escorpiano. REST e MCP locais retornam capacidades V3; catálogo MCP aceita versão 3 para leitura, edição, estado e histórico.
- O perfil de teste possui Instagram direto, sem canal zernio-instagram. Nenhuma automação existente foi modificada ou ativada e nenhum conteúdo foi publicado. A comprovação de envio/histórico remoto depende de conectar uma conta Zernio de teste com comentários/mensagens autorizados.

Limitação de ferramentas: pnpm lint não tem script no package.json e resolveu um executável externo; ESLint direto encontrou erro circular na configuração existente. Isso não foi apresentado como lint aprovado. Nenhuma imagem Docker foi gerada.
