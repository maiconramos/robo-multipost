# Áudio do Instagram, fundos do Facebook e Tumblr

Estes portes usam o novo compositor e os contratos compartilhados de publicação do painel, API e MCP. Não exigem migração Prisma. Publicações reais devem ser verificadas no canal após instalar a versão.

## Áudio de Reels

No canal Instagram conectado pelo **Facebook Login**, adicione um único MP4 e escolha áudio nas configurações do canal. A busca vazia mostra tendências; também é possível buscar música ou áudio original. A escolha e os volumes do áudio e do vídeo (0–100, inclusive zero) são salvos nas configurações do post e enviados na criação do Reel.

Stories, carrosséis, Instagram Login e Zernio não suportam esta API de áudio. Se mudar o tipo/canal de um post com áudio, remova a escolha antes de agendar. O servidor verifica o provider real do canal, inclusive em lotes e chamadas API/MCP; rascunhos podem guardar uma escolha ainda incompleta.

A busca usa o **User Access Token** obtido no Facebook Login, guardado de forma criptografada em `Integration.refreshToken`. A publicação continua usando o token da Página. Canais antigos, ou recuperados pelo self-heal com token de Página, podem precisar ser reconectados pelo Facebook Login para buscar áudio. Falha na busca não desconecta a publicação do canal. Tokens não são enviados ao navegador. A disponibilidade do catálogo depende do acesso concedido pela Meta.

A [API de áudio da Meta](https://developers.facebook.com/documentation/instagram-platform/content-publishing/audio-api) pode retornar uma prévia direta (`download_url`), um link para ouvir no Instagram (`on_platform_audio_preview_link`) ou nenhuma das duas opções. O seletor mostra **Reproduzir**, **Ouvir no Instagram** ou **Prévia indisponível**, respectivamente. Áudios sem prévia continuam selecionáveis. A lista e o áudio escolhido exibem a capa fornecida pela Meta (ou o avatar do criador nos sons originais); quando não houver imagem ou o carregamento falhar, aparece um ícone musical. O campo `image` já faz parte do retorno da API/MCP. Quando a busca omite o avatar de um som original, o servidor consulta o detalhe do áudio: até dez IDs únicos por busca, três consultas simultâneas e orçamento total de cinco segundos. O cache é por processo e canal, com até 200 entradas; imagens válidas duram dez minutos e respostas sem imagem, um minuto. Falhas de rede, autorização e limite não são cacheadas; HTTP 429 interrompe as consultas restantes. Falhas na recuperação do avatar preservam a lista e o ícone musical. Uma falha de reprodução aparece somente no item, sem apagar a busca ou exigir reconexão do canal.

O resultado de `audioSearch` mantém o formato de lista no painel, API e MCP e acrescenta `platformPreviewUrl` ao lado de `previewUrl`; ambos são strings vazias quando indisponíveis. URLs de prévia são temporárias e não são gravadas nas configurações do post. O link externo aceita apenas HTTPS sem credenciais nos hosts `instagram.com`, `www.instagram.com` e `m.instagram.com`. A disponibilidade de prévia não garante que o áudio estará disponível no momento da publicação.

## Fundos de texto no Facebook

Na conexão nativa do Facebook, escolha um fundo nas configurações. Só é aplicado em texto não vazio de até **130 caracteres**, sem mídia, story, URL incorporada ou link no texto. O preview se atualiza com a escolha e deixa de mostrar o fundo quando o conteúdo não se enquadra. A escolha permanece salva para voltar a ser usada se o texto ficar elegível.

Os IDs vêm do catálogo comunitário do Postiz e podem ser retirados pelo Facebook. As cores no preview são aproximações. Se a Graph API recusar explicitamente `text_format_preset_id` com HTTP 400/código 100, há uma única nova tentativa sem o fundo. Erro de rede, 5xx, corpo inválido ou ausência de confirmação encerra o envio com orientação para conferir o canal; não há repetição automática nessas situações. Zernio não recebe esse parâmetro.

## Configuração do Tumblr

1. Cadastre um aplicativo em [Tumblr OAuth Apps](https://www.tumblr.com/oauth/apps), com callback `https://SEU-DOMINIO/integrations/social/tumblr` (o domínio deve coincidir com `FRONTEND_URL`).
2. Em **Configurações → Credenciais → Tumblr**, salve OAuth Consumer Key e Consumer Secret no workspace ou perfil que fará a conexão. O provider recebe `ClientInformation` na autorização, troca e renovação de tokens. `TUMBLR_CLIENT_ID` e `TUMBLR_CLIENT_SECRET` são apenas o caminho legado quando esse objeto não é fornecido.
3. Adicione o canal Tumblr, autorize `basic`, `write` e `offline_access` e selecione um dos blogs retornados para sua conta. O servidor verifica novamente a propriedade do blog na seleção e reconexão.
4. No compositor, use texto e mídia, com título, tags separadas por vírgula, link e URL da fonte opcionais como metadados adicionais. O compositor exige texto ou mídia; preencher somente os metadados não habilita o agendamento. URLs precisam de `http://` ou `https://`. Há uma publicação por envio, sem comentários encadeados: até 30 imagens e um vídeo MP4, fotos de até 20 MB e total de mídia de até 100 MB. Imagens aceitas: JPEG, PNG, GIF e WebP. Remova blocos extras para este canal antes de agendar; rascunhos preservam o conteúdo incompleto.

Mídia local deve pertencer ao diretório configurado de uploads; travessia de caminho e symlinks externos são recusados. Mídia remota passa pelo downloader com proteção contra SSRF, limite de bytes e prazo. Todas as mídias são validadas antes da criação do post. A criação usa NPF e só termina com sucesso se o Tumblr retornar ID válido, preservando IDs longos como strings. Em resposta incerta, confira o blog antes de republicar manualmente.

Referência de contrato: [API oficial do Tumblr](https://github.com/tumblr/docs/blob/master/api.md). Tokens seguem a criptografia e a renovação existentes do MultiPost; não há nova coluna de segredo ou alteração de cobrança.
