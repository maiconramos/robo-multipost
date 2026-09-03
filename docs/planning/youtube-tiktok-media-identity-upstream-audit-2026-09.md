# Auditoria do encoding de mídia YouTube/TikTok — setembro de 2026

> Branch: `codex/upstream-youtube-tiktok-media-identity`  
> Base do fork: `89efef15` (`main`, após o porte de analytics)  
> Origem upstream: `5a9b1cc9`  
> Estado: auditado e não aplicável à arquitetura atual

## Veredito

O commit não deve ser portado isoladamente.

Ele adiciona `accept-encoding: identity` a três helpers específicos do novo
pipeline upstream:

- `YoutubeProvider.youtubeMediaSize`, que faz `HEAD` para obter o tamanho;
- `YoutubeProvider.youtubeChunkStream`, que faz leituras HTTP Range;
- `TiktokProvider.tiktokChunkStream`, que faz leituras HTTP Range.

Nenhum desses helpers existe no `main` atual do Robô MultiPost. Os commits que
os introduzem também não fazem parte da ancestralidade desta branch:

- `9980825a`: streaming genérico de uploads entre vários providers;
- `e2cdd5e0`: workflow pending-post v1.0.6 e remodelagem dos providers.

Aplicar apenas `5a9b1cc9` seria impossível sem trazer junto uma mudança de
arquitetura muito maior, já classificada na triagem como épico separado.

## Fluxos atuais preservados

- **YouTube:** lê o vídeo por `getSsrfSafeAxios` com
  `responseType: 'stream'` e entrega o stream contínuo ao SDK do Google. Não há
  cálculo por `Content-Length` nem GETs parciais no provider atual.
- **TikTok:** envia `source: 'PULL_FROM_URL'`; a própria plataforma busca a URL
  do vídeo ou das imagens. O provider atual não relê o arquivo em blocos.
- **Segurança:** o download do YouTube continua no Axios com DNS pinado. Nenhum
  `fetch` cru ou caminho alternativo foi introduzido.

O problema corrigido pelo upstream — uma origem comprimida perder
`Content-Length` e responder `200` ao invés de `206` durante um upload
fragmentado — não ocorre nesses dois fluxos atuais porque eles não fazem as
leituras HEAD/Range em questão.

## Quando reavaliar

O cabeçalho `accept-encoding: identity` torna-se obrigatório se o fork adotar o
pipeline de streaming/pending-post. Nesse momento, o porte precisa entrar junto
dos testes de:

1. `HEAD` remoto com `Content-Length` estável;
2. GET remoto com `Range` e resposta `206` exata;
3. dispatcher SSRF/DNS-pinning em cada requisição;
4. origem que ignora Range e responde o corpo inteiro;
5. retomada do upload sem duplicar publicação no Temporal.

Até esse épico ser aprovado, não há código ou comportamento de produção a
alterar para este item.
