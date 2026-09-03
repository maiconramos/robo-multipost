# Auditoria do erro no stream do gerador — setembro de 2026

> Base do fork: `c03ac050` (`main`, após o MCP stateless)
> Upstream principal: `fe40b587`

## Escopo

Corrigir uma única falha: quando uma etapa do LangGraph lança erro depois de
`/posts/generator` começar a enviar NDJSON, a resposta era truncada e o frontend
permanecia em “Gerando”. Esta PR não altera o modelo, provider, prompt, créditos,
grafo ou geração de vídeo.

## Diagnóstico

O endpoint já havia enviado headers e possivelmente eventos quando entrava no
`for await`. Nesse ponto uma exceção não podia mais ser convertida pelo filtro do
Nest em uma resposta HTTP normal. Ela encerrava o stream abruptamente.

No navegador havia uma segunda falha: cada retorno de `reader.read()` era
tratado como se contivesse linhas JSON completas. TCP/HTTP não preserva essas
fronteiras; um evento dividido entre dois chunks era ignorado nas duas metades.
O acesso final a `lastResponse.data.output` então falhava ou devolvia resultado
incompleto, e `setLoading(false)` não estava protegido por `finally`.

## Porte adaptado

### Backend

O loop agora captura falhas depois do início do stream e escreve uma última
linha:

```json
{ "name": "error", "error": true, "message": "..." }
```

Uma `HttpException` carrega sua mensagem já controlada. Qualquer outra exceção
vira uma mensagem genérica em pt-BR, sem devolver stack, resposta crua ou token
do provider. Em ambos os casos `res.end()` é executado. A chamada existente
`AgentGraphService.start(orgId, body, profileId)` foi preservada.

### Frontend

O parser foi extraído para `generator.stream.ts` e mantém um buffer entre
leituras. Ele:

- recompõe uma linha NDJSON dividida em qualquer ponto;
- processa várias linhas no mesmo chunk;
- aceita a última linha mesmo sem `\n` final;
- lança a mensagem do evento `{ error: true }`;
- usa mensagem segura para NDJSON malformado.

O submit também verifica `response.ok` antes de ler o corpo, exige um resultado
com `content`, mostra a falha pelo toaster e limpa progresso/loading no
`finally`.

## Diferenças preservadas do Multipost

- o perfil ativo continua sendo enviado ao `AgentGraphService`;
- a cadeia de IA `PROFILE → WORKSPACE → 412` não muda;
- nenhum débito/reembolso de crédito foi movido;
- o erro `412` anterior ao stream continua vindo do backend e agora aparece no
  toast, sem acionar o billing `402`;
- o compositor só abre quando há saída completa.

## Commits do bloco que não entram aqui

- `95f08f57` e `2de87c33`: tratam `uploadFromUrl`, ferramenta ausente neste
  fork.
- `1785cf91`: a camada própria `AiImageService`/`MediaService` já converte e
  registra os erros de provider; copiar o helper OpenAI legado substituiria o
  contrato atual.
- `b12c03f3`, `9ef99bc4` e `88008142`: os conceitos aplicáveis ao Kie serão
  portados separadamente sobre `AiVideoService`, sem trazer `videos/veo3` nem o
  pipeline assíncrono novo do upstream.

## Evidência

O ciclo RED reproduziu cinco falhas:

- controller deixava escapar `HttpException` e erro inesperado;
- parser perdia sucesso e erro fragmentados;
- NDJSON inválido era ignorado.

Depois do porte:

- spec do controller: 2 testes verdes;
- spec Vitest do parser: 3 testes verdes;
- o teste de erro inesperado confirma que o texto sensível original não aparece
  no evento final.
- backend completo: 16 suítes e 131 testes verdes;
- bibliotecas completas: 92 suítes e 915 testes verdes;
- builds de frontend, backend e orchestrator concluídos.

## Gate de pré-release

Na imagem de pré-release, forçar uma falha controlada no gerador depois do
primeiro evento e confirmar visualmente: toast exibido, spinner removido e
compositor não aberto. A validação automatizada cobre o protocolo e a limpeza
lógica; o estado visual continua sendo um gate separado porque iniciar o backend
local com a configuração deste checkout pode alcançar banco e Temporal reais.
