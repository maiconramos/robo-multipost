# MultiPost local em Docker para homologação Facebook

> Atualização de 26/10/2026: para desenvolver com os dados recuperados, use `pnpm dev:local`, conforme o [guia de desenvolvimento](multipost-local-development.md). Ajustes de frontend não exigem reconstruir a imagem. A restrição das automações compartilhadas ao Escorpiano foi removida; referências a essa restrição abaixo são históricas. O isolamento entre organizações, perfis e contas permanece ativo.

> Atualização de 25/10/2026: base sincronizada com a v0.6.1 do worktree `security`,
> preservando automações e interface locais. Build completo em Node 22.23.4/trixie;
> veja [validação e retorno seguro](worktree-security-sync-20261025.md).

> Atualização de 22/10/2026: o criador compartilhado V2 foi instalado no banco recuperado com backup e migração aditiva. O overlay meta-proof agora habilita V2 exclusivamente para a integração Escorpiano; consulte [operação do criador](facebook-shared-automations.md). As notas históricas abaixo sobre V2 ainda não implementado descrevem a preparação anterior.


Stack isolada `multipost-facebook-local`, definida em `docker-compose.local.yaml`. Banco, cache, Temporal e uploads usam volumes próprios; não reutiliza os containers/volumes antigos `postiz-*`.

**Atualização de 20/10/2026:** para retomar as contas antigas, foi preparada uma cópia recuperada com o terceiro arquivo `docker-compose.restored.yaml`. Seguir [recuperação e comandos atuais](multipost-local-recovered.md). Os comandos abaixo com apenas os arquivos base/túnel selecionam o banco vazio da homologação anterior; não usar para recriar o app recuperado sem intenção de rollback.

O app é construído do código local. Backend e worker são compilados; frontend usa Next em modo desenvolvimento para permitir ajuste das URLs de callback sem reconstruir o frontend. Nginx expõe tudo em `http://localhost:4007`; Temporal UI fica em `http://localhost:8233`. As portas são vinculadas somente ao loopback. Banco, Redis e gRPC Temporal não são publicados.

Para a captura de webhook exclusiva do Escorpiano, há um quarto overlay opcional `docker-compose.meta-proof.yaml`. O [runbook Meta](facebook-automation-meta-proof.md#arquivos-privados-e-inicialização-do-receptor) contém o comando completo com o banco restaurado, os arquivos privados necessários e a forma de parar somente o receptor. Essa captura não ativa as automações Facebook no produto.

## Configuração privada

Arquivo `.secrets/multipost-local.env`, não versionado, com permissão `600`:

```dotenv
LOCAL_DATABASE_PASSWORD=GERAR_VALOR_LOCAL
JWT_SECRET=GERAR_VALOR_LOCAL
ENCRYPTION_KEY=GERAR_VALOR_LOCAL
MAIN_URL=http://localhost:4007
FRONTEND_URL=http://localhost:4007
NEXT_PUBLIC_BACKEND_URL=http://localhost:4007/api
NOT_SECURED=true
DISABLE_REGISTRATION=false
```

Gerar segredos diferentes para esta stack; não copiar credenciais de produção. Gerar `LOCAL_DATABASE_PASSWORD` em hexadecimal para não introduzir caracteres reservados na URL PostgreSQL. Não trocar JWT/ENCRYPTION_KEY depois de conectar contas. O `.env` original do repositório é preservado e excluído do contexto Docker, assim como `.secrets/`.

## Iniciar e acompanhar

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml up -d --build
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml ps
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml logs --tail 100 app
```

O serviço `schema` aplica o schema somente no PostgreSQL exclusivo desta stack, sem `--accept-data-loss`. O app espera esse serviço, Redis e Temporal. O entrypoint local inicia os processos explicitamente e não chama os scripts recursivos `pm2` da raiz. Reiniciar o app não executa sincronização de schema.

O healthcheck do app verifica API, arquivo estático do frontend (`/favicon.ico`) e pollers Temporal de `main`, `facebook` e `instagram`. O arquivo estático evita compilar uma segunda página em paralelo somente para verificar saúde; ele não comprova renderização autenticada. O primeiro acesso pode demorar enquanto o Next compila a página. O volume Temporal usa `/home/temporal`, diretório gravável pelo usuário não root da imagem; montar em `/data` sem preparar permissões faz o SQLite falhar no boot.

### Atualização de memória — 22/10/2026

Durante a validação do criador compartilhado, `docker events` confirmou um OOM às 17:50 (America/Sao_Paulo), com Webpack e consumo observado de aproximadamente 8,3 GiB no app. Aumentar apenas o heap não resolveu todas as compilações concorrentes. O entrypoint local passou a usar `next dev --turbopack`, preservando o heap do frontend em 6144 MiB. O healthcheck deixou de compilar a tela de login. As opções de concorrência Webpack no wrapper permanecem somente como fallback; não limitam o Turbopack.

Após recriar somente o app às 17:56, o navegador autenticado renderizou o criador, o calendário `/launches` e as configurações `/settings`; a automação salva e ativa permaneceu no banco recuperado. Amostras do app ficaram entre 2,9 e 3,9 GiB, com zero reinicializações/OOM e healthcheck saudável durante essa verificação. Isso não representa medição contínua nem garantia de estabilidade prolongada. O ajuste fica restrito ao ambiente local; não altera o build de produção nem a sanitização.

Os dois avisos de inicialização `reconcileRefreshTokensCron: Temporal Service is not initialized` (corrigidos em 28/10/2026 — a reconciliação roda em `onApplicationBootstrap`, depois do cliente do Temporal ficar pronto) apareciam no backend/worker local. Eram anteriores ao dispatcher compartilhado; `RUN_CRON` continua vazio e nenhuma renovação global foi habilitada. O dispatcher V2 inicializou e executou suas atividades separadamente.

### Reinicializações do frontend e erro 502 — 21/10/2026

Os logs correlacionaram a compilação de `/launches`, o aviso `Server is approaching the used memory threshold, restarting...` e erros `upstream prematurely closed connection` no Nginx. O processo Next reiniciava internamente, embora o container permanecesse em execução e a tela de login voltasse a responder. Houve sete ciclos observados; API, banco e túnel continuavam acessíveis.

O entrypoint local passa de 4096 para 6144 MiB de heap **somente no frontend**. A VM Docker desta máquina oferece aproximadamente 9,7 GiB; o heap não inclui toda a memória nativa do processo, backend, workers e demais containers. O script é montado somente leitura em `services.app`, permitindo aplicar o ajuste sem rebuild da imagem. Recriar somente o app usando os três arquivos indicados no [runbook de recuperação](multipost-local-recovered.md), sem iniciar `schema`.

Validar login, API e workers e, com a sessão existente do usuário, a compilação e renderização de `/launches`, observando memória e logs. Redirecionamento HTTP 307 sem sessão e login HTTP 200 não comprovam a correção da tela principal. Se o novo limite também for atingido, investigar a compilação antes de elevar novamente a memória. Não desativar a proteção de memória do Next nem alterar os dados para esse diagnóstico.

Após superar a reinicialização, a renderização revelou um erro separado: `ENOENT` em `.next/browser/default-stylesheet.css`, vindo do JSDOM interno de `isomorphic-dompurify` empacotado para SSR. O wrapper `next.tunnel.config.mjs` inclui esse pacote em `serverExternalPackages`, preservando qualquer lista da configuração base. O [carregamento nativo documentado pelo Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages) mantém o caminho relativo dos arquivos do pacote. A sanitização e suas regras continuam ativas; apenas o overlay local muda. Não copiar um CSS vazio nem remover o sanitizador como alternativa.

Validação em 21/10/2026, após o reinício das 08:38:31 (America/Sao_Paulo):

- `bash -n`, `node --check` e renderização filtrada do Compose aprovados; banco `multipost_restored_20261020`, uploads recuperados, portas em loopback e mounts somente leitura mantidos.
- `/launches` abriu com a sessão já existente, exibindo o calendário e os canais recuperados. Um novo reload também renderizou a tela; nenhum login automatizado, publicação ou alteração de conta.
- Até 08:41:02, zero reinicializações por memória, zero erros de stylesheet e zero `upstream prematurely closed` desde o reinício. Login e API públicos responderam 200, em aproximadamente 0,52 s e 0,09 s; app `healthy` e workers 200.
- Consumo observado do app após as duas correções: amostras de 6,29 a 6,53 GiB dos 9,7 GiB da VM, com CPU retornando a aproximadamente 4% após a compilação. Não é um pico medido continuamente nem garantia de estabilidade prolongada. O primeiro carregamento com cache frio ainda pode demorar.
- Teste automatizado do sanitizador carregado pelo Node da imagem, com a allowlist do produto: script, atributo de evento e URL `javascript:` removidos; link HTTPS preservado. Console de erros do navegador vazio após o reload.

A checagem de login isolada não havia detectado a falha do calendário; usar a navegação autenticada acima como parte da validação de futuras mudanças neste ambiente.

Nesta máquina, o helper `docker-credential-desktop` ficou sem responder ao consultar registries. Os pulls/build desta preparação usaram um cliente anônimo temporário, sem alterar credenciais globais, para imagens públicas:

```bash
docker --config .secrets/docker-local-client --host "unix://$HOME/.docker/run/docker.sock" compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml up -d --build
```

O arquivo desse cliente também é local/ignorado. A imagem `multipost-facebook-local:source` é exclusivamente local (`pull_policy: never`); primeiro concluir o build, depois iniciar app/schema com `--no-build`. Não tentar autenticar em registry para baixar essa tag.

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml stop
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml start
```

Não usar `down -v` para desligar: apagaria as contas/Páginas de teste conectadas. Para atualizar código, reconstruir a imagem e recriar app/schema conforme as migrações aprovadas; esta stack não é destinada à produção.

Ao mudar somente as URLs/cookies no arquivo de ambiente, recriar o app para aplicar as variáveis; `start`/`restart` não as recarregam:

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml up -d --no-build --no-deps --force-recreate app
```

## Facebook e prova da Meta

Criar conta local, abrir as credenciais Meta do perfil e cadastrar o aplicativo de teste. O callback usado pelo provider é `FRONTEND_URL/integrations/social/facebook`. Para localhost, o callback correspondente é `http://localhost:4007/integrations/social/facebook`; confirmar a aceitação na configuração de desenvolvimento do aplicativo Meta.

Meta não entrega webhook ao localhost. A prova real exige receptor HTTPS acessível. Antes de habilitar túnel/callback, definir o domínio de homologação, alinhar URLs e política de cookies e registrar o callback exato no aplicativo de teste. O `.env` anterior contém referências a domínios locais de desenvolvimento, mas isso não comprova que o túnel esteja ativo ou autorizado no app Meta.

Conectar a Página para publicação não comprova `pages_messaging` ou assinatura `feed`. O [runbook de prova Meta](facebook-automation-meta-proof.md) continua sendo o gate da automação compartilhada; a stack Docker não habilita a feature V2 ainda não implementada.

## Usar o túnel Cloudflare existente

Em 19/10/2026, o usuário solicitou usar as duas rotas já cadastradas no túnel `multipost`. O overlay `docker-compose.tunnel.yaml` alinha a stack a essas origens, sem trocar credenciais nem volumes:

| Domínio HTTPS | Origem no painel Cloudflare | Destino no container |
| --- | --- | --- |
| `localmultipost.automacaosemlimites.com.br` | `http://localhost:4200` | Nginx `5000` → Next `4200` e arquivos `/uploads` |
| `localmultipostapi.automacaosemlimites.com.br` | `http://localhost:3000` | Nginx `5001` → API `3000` |

As portas adicionais continuam em loopback; o acesso externo acontece pelo túnel. O `cloudflared` já roda no host como serviço, portanto não iniciar outro conector nem copiar seu token para o Compose. A porta `4007` continua disponível para sondas locais, mas, com o overlay, o acesso autenticado deve usar o domínio HTTPS configurado.

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml -f docker-compose.tunnel.yaml up -d --no-build --no-deps --force-recreate app
```

Nesta máquina, pode-se usar o prefixo de cliente Docker temporário descrito acima. Não é necessário reconstruir a imagem para aplicar o overlay. Nos comandos posteriores de recriação, incluir os dois arquivos `-f` para preservar o modo túnel.

O overlay define `MAIN_URL`, `FRONTEND_URL`, `NEXT_PUBLIC_BACKEND_URL` e **`NOT_SECURED: ''`**. O valor é lido como liga/desliga (`isNotSecured`, `libraries/helpers/src/utils/not.secured.ts`): só `true`/`1`/`yes`/`on` ligam o modo sem HTTPS; `false` ou vazio mantêm os cookies com as flags de HTTPS. Antes desta versão qualquer texto não vazio (inclusive `false`) ligava o modo inseguro. O backend já permite a origem do frontend e os headers usados pelo cliente. O callback Facebook neste modo é `https://localmultipost.automacaosemlimites.com.br/integrations/social/facebook`; cadastrá-lo no aplicativo Meta usado na homologação.

`nginx.tunnel.conf` é montado somente leitura no overlay; o Nginx original de produção permanece preservado. Ele informa o protocolo HTTPS ao app, atende WebSocket e aplica um limite compartilhado de 6 requisições POST por minuto, com burst de 10, para `/auth/` na API e `/api/auth/` no frontend, sem distinguir maiúsculas/minúsculas (excesso retorna 429). O cliente vem de `CF-Connecting-IP`, preenchido pela Cloudflare; sem esse header, usa o endereço da conexão. Isso pressupõe o conector no host e origens limitadas ao loopback. O access log desse Nginx omite query strings de callbacks OAuth. O wrapper `next.tunnel.config.mjs` importa a configuração original, montada como `next.config.base.mjs`, inclui a correção de carregamento SSR descrita acima e desativa `logging.incomingRequests` do Next dev; sem isso, o próprio Next imprimiria a URL com o código OAuth. Esses mounts são somente leitura e não exigem rebuild. Logs de erros e logs explícitos da aplicação continuam ativos.

O overlay também define `DISABLE_REGISTRATION: 'true'`: a regra existente permite criar o primeiro workspace com banco vazio e fecha o autocadastro posterior, preservando convites válidos. A checagem inicial encontrou zero organizações. Nenhuma conta é criada pelo setup. Enquanto esse cadastro não for concluído, o bootstrap permanece público; o rate limit não reserva a primeira conta para o responsável. Em novos ambientes, concluir o bootstrap antes de expor o túnel ou restringi-lo ao responsável. O contrato atual usa cookies em `.automacaosemlimites.com.br`, compartilhados entre subdomínios; outra instalação MultiPost sob esse domínio pode disputar cookies no mesmo perfil de navegador. O overlay não modifica esse contrato.

Para voltar ao modo exclusivamente local, recriar somente o app com o arquivo base, sem o overlay. As portas `4200`/`3000` deixarão de estar publicadas, e o túnel voltará a responder erro de origem até receber outra configuração; os dados persistidos são mantidos.

Validação do acesso HTTPS concluída em 19/10/2026:

- O conector `cloudflared` já estava ativo no host; não foi reiniciado nem teve token/configuração alterados. Antes do overlay, ambos os domínios retornavam 502; depois, cadastro e API retornaram HTTP 200.
- `/` retornou 307 para `/auth`, mantendo o acesso HTTPS. Preflight OPTIONS na API retornou 204, origem exata do frontend, `Access-Control-Allow-Credentials: true` e os headers customizados esperados.
- Smoke local sem credenciais: 14 POSTs a uma rota inexistente, alternando `/AUTH/` na API e `/api/auth/` no frontend com IP sintético, resultaram em 11 respostas 404 e 3 respostas 429. O teste confirmou limite compartilhado e correspondência sem distinguir maiúsculas/minúsculas.
- Antes do wrapper, uma query sintética em `/auth` apareceu no stdout do Next (RED). Após recriação, a mesma classe de request retornou 200, o marcador não apareceu no stdout Docker nem no access log do Nginx, e o acesso `/auth` foi registrado sem query (GREEN).
- Tela de cadastro pública inspecionada no navegador, sem erros no console coletado; app `healthy` e `/health/workers` HTTP 200 para `main`, `facebook` e `instagram`. API pública retornou `App is running!`.
- `docker compose config --quiet`, `nginx -t`, import do wrapper do Next e `git diff --check` aprovados. Nenhum schema reaplicado; somente o app foi recriado. Login e OAuth ainda não executados pelo agente.

## Estado de validação

Validado em 19/10/2026:

- Imagem local construída com instalação PNPM pelo lockfile e compilação de backend/orchestrator concluídas.
- Serviço `schema` encerrado com código 0, exclusivamente no banco novo `multipost` em `postgres:5432`.
- App, PostgreSQL, Redis e Temporal com healthcheck `healthy`; cluster Temporal respondeu `SERVING`.
- API `http://localhost:4007/api/` e login `/auth/login` responderam HTTP 200.
- `/health/workers` interno respondeu HTTP 200 com pollers saudáveis nas filas `main` (workflow), `facebook` e `instagram` (activity).
- Tela `/auth` inspecionada no navegador: formulário de cadastro em português, sem erros no console coletado. A primeira compilação do login levou cerca de 39 segundos; os acessos seguintes responderam normalmente.
- Nenhuma conta/Página criada ou conectada automaticamente. Cadastro, credenciais Meta e OAuth permanecem com o usuário. Nenhum túnel público iniciado.

Limitação observada no código existente (corrigida em 28/10/2026, ver `StartupMigrationService.onApplicationBootstrap`): `StartupMigrationService.onModuleInit` tentou executar `reconcileRefreshTokensCron` antes da inicialização do cliente Temporal, com `Temporal Service is not initialized`. A consulta ao Temporal confirmou que `refresh-tokens-cron` não foi criado. Isso não impediu API, cadastro ou pollers de iniciar, mas a renovação proativa em lote não está validada e precisa de correção com teste antes de homologação prolongada. O boot também emitiu aviso de configuração antiga do Sentry (`onRequestError` ausente). Esses pontos não foram alterados como parte da preparação Docker.


## Cache do frontend no túnel — 21/10/2026

Na validação do onboarding Facebook, a tela mostrou chaves `fb_auto_*` apesar de os arquivos pt/en da nova imagem e seus chunks conterem as traduções. A origem respondeu `Cache-Control: no-cache, must-revalidate`; a mesma URL pelo túnel respondeu `max-age=31536000`. O navegador conservou a versão anterior após reload comum.

O entrypoint local agora define `NEXT_DEPLOYMENT_ID=local-<timestamp>` somente para o frontend, uma vez por inicialização. O Next acrescenta `?dpl=...` às URLs dos chunks, inclusive traduções dinâmicas. O valor permanece igual nos subprocessos da mesma execução. Reiniciar o app muda o identificador; edições durante a mesma execução não o mudam. Abas antigas podem sofrer recarregamento completo. O ajuste não modifica DNS, regras Cloudflare, backend, workers ou configuração de produção.

A imagem anterior ao onboarding permanece com a tag `multipost-facebook-local:pre-onboarding-20261021`; a imagem nova usa `multipost-facebook-local:source`. Ambas utilizam o mesmo banco recuperado quando iniciadas com o overlay `restored`. Não usar rollback para o banco vazio como forma de reverter apenas a imagem.

Validação do ajuste de cache: `bash -n` aprovado, app reiniciado sem reconstruir imagem, HTML/chunks com `dpl=local-1792619848` e traduções pt-BR da nova seção confirmados no navegador. Console sem erros/avisos capturados e login HTTP 200. A primeira compilação após o restart pode ultrapassar o timeout do túnel; aguardar o app saudável e recarregar a página.

### Atualização de interface em 22/10/2026

Para aplicar somente a correção de datas e o roteiro Facebook, foi construída uma imagem derivada da imagem local anterior, copiando quatro arquivos: `facebook-automation-setup.component.tsx`, `facebook-automation-dates.ts` e os catálogos de tradução pt/en. Os quatro hashes SHA-256 foram comparados entre checkout e container e coincidem. Não houve rebuild de dependências/backend, migração ou alteração dos volumes. O build integral reproduzível continua em `var/docker/local.Dockerfile`; futuras mudanças de backend/dependências devem usar esse build integral.

- Imagem anterior preservada: `multipost-facebook-local:pre-facebook-ui-20261022` (base `e4fd92e8efe4eab8dea4c815e86b08a6ff7455059a98d6a0ae5bcc073155daca`).
- Imagem atual: `multipost-facebook-local:source` (manifest `29cb640278cf88e152fb255ba259716e704cc73ebad8e4057dd2ebac9d57ab3a`).
- A receita pontual foi `/tmp/multipost-facebook-ui-20261022.Dockerfile`: `FROM` da tag anterior e `COPY` dos quatro arquivos para os mesmos caminhos sob `/app`. O arquivo temporário não é necessário para iniciar/recriar a imagem já construída.

Somente o serviço `app` foi recriado com os quatro overlays, preservando o banco recuperado e o receptor antigo:

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml -f docker-compose.tunnel.yaml -f docker-compose.restored.yaml -f docker-compose.meta-proof.yaml up -d --no-build --no-deps --wait --wait-timeout 300 app
```

Para reverter apenas essa interface, apontar a tag `source` para `pre-facebook-ui-20261022` com `docker image tag` e repetir a recriação acima. Isso não reverte nem remove dados. Não omitir `restored` para realizar rollback de código.
