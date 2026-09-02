# Proteção SSRF nas chamadas de saída

## Comportamento padrão

Chamadas de saída que podem receber uma URL configurável usam o mesmo lookup
DNS pinado nos clientes Undici (`fetch`) e Axios. O IP é conferido no momento
em que a conexão é aberta e o cliente conecta ao endereço que acabou de ser
aprovado. Isso fecha a janela entre uma validação anterior e uma nova resolução
DNS, inclusive em redirects.

São bloqueados por padrão:

- loopback, endereço não especificado e link-local;
- redes privadas IPv4 e IPv6;
- metadata (`169.254.0.0/16`), CGNAT e faixas de benchmark;
- multicast, ranges reservados e IPv4 mapeado em IPv6.

A proteção cobre o cliente compartilhado dos providers (`SocialAbstract`), os
downloads de mídia por Axios, o SDK do Bluesky, providers self-hosted como
WordPress, Mastodon, Lemmy, Listmonk e MeWe, uploads intermediários entregues
pelas APIs dos providers e os webhooks de saída.

## Instalações self-hosted em rede privada

Se o Robô MultiPost precisar alcançar um WordPress, Mastodon ou webhook HTTPS
dentro da mesma VPC/rede Docker, configure:

```dotenv
DISABLE_SSRF_PROTECTION=true
```

Reinicie backend e orchestrator depois de alterar a variável. O opt-out é
intencionalmente explícito e vale para as chamadas de providers/webhooks feitas
por usuários autenticados. Só o habilite quando todos os usuários da instância
forem confiáveis e a rede de destino estiver sob o mesmo controle operacional.

Uploads e importações públicas por URL **não** herdam esse opt-out: continuam
exigindo HTTPS público, validação de DNS, dispatcher pinado, limite de tamanho e
validação por magic bytes. Essa separação impede que a compatibilidade
self-hosted reabra acesso à rede interna pela API pública.

## Verificação

Os testes automatizados cobrem IP literal privado (IPv4/IPv6), resposta DNS
mista, DNS rebinding entre validação e conexão, os agentes Axios/Undici, o
opt-out e a separação entre webhook confiável e upload público.
