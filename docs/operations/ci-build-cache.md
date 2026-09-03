# Cache do workflow de build

O workflow `.github/workflows/build.yml` cacheia somente o store global do
pnpm. A chave é derivada de `pnpm-lock.yaml`, pois o conteúdo desse store
depende da árvore de dependências, não dos arquivos-fonte da aplicação.

## Por que não usar hash do código-fonte

O `actions/cache` avalia novamente a chave na etapa de pós-execução. Quando a
chave incluía `hashFiles('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx')`, a
segunda avaliação ocorria depois de `pnpm install` e do build. O glob passava a
percorrer também uma árvore muito maior, incluindo dependências e artefatos, e
podia exceder o limite de 120 segundos do GitHub Actions. O resultado era um
job vermelho mesmo quando testes e build tinham terminado com sucesso.

## Invariantes

- `pnpm install --frozen-lockfile`, testes e build continuam sendo gates;
- uma alteração no lockfile cria uma nova chave de cache;
- arquivos `.next`/`dist` não entram no cache de dependências;
- falha real em instalação, testes ou build continua falhando o job.

Ao investigar uma falha futura, verificar a etapa que falhou. Um erro em
`Post Setup pnpm cache` não deve ser confundido com falha de teste ou de build.
