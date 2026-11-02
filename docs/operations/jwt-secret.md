# JWT_SECRET: valor de exemplo e troca segura

O `JWT_SECRET` assina tudo que prova identidade na instância: sessão de login,
convite de equipe, link de "esqueci a senha", token da extensão e o
provisionamento enterprise. Quem conhece o valor consegue fabricar esses
tokens.

## O problema do valor de exemplo

O `docker-compose.yaml` publicado no repositório traz o `JWT_SECRET` com um
texto de exemplo fixo **dentro do próprio arquivo** (o `.env` não é lido para
essa variável). Quem sobe a instância sem editar essa linha roda com uma chave
que qualquer pessoa conhece.

Desde esta versão o backend:

- registra um erro no log ao iniciar (`Security`) quando o `JWT_SECRET` é um
  dos valores de exemplo do repositório (`libraries/helpers/src/auth/jwt-secret.strength.ts`);
- desliga as rotas `/enterprise/*` enquanto a chave for de exemplo (com ela,
  qualquer um criava uma organização SUPERADMIN com apiKey sem login);
- avisa também quando a chave tem menos de 32 caracteres.

O compose **não** passou a ler o `JWT_SECRET` do `.env` de propósito: em
instalações que já rodam, isso trocaria a chave em silêncio e as credenciais
salvas deixariam de abrir (veja abaixo).

## Instalação nova

Antes do primeiro `docker compose up`, troque a linha `JWT_SECRET` do
`docker-compose.yml` por um valor aleatório longo:

```bash
openssl rand -hex 32
```

Gere também um `ENCRYPTION_KEY` próprio (mesma linha do compose) — assim a
criptografia das credenciais não depende do `JWT_SECRET`.

## Instalação que já roda com o valor de exemplo

Trocar o `JWT_SECRET` muda o que foi cifrado com ele. Faça nesta ordem:

1. **Backup** do banco.
2. Se o `ENCRYPTION_KEY` estiver vazio, defina `ENCRYPTION_KEY` com o
   **valor atual** do `JWT_SECRET` (o texto de exemplo, exatamente igual).
   Sem isso, todas as credenciais salvas em Settings > Credenciais, chaves de
   IA e tokens cifrados deixam de abrir, porque a chave de criptografia é
   derivada do `JWT_SECRET` quando o `ENCRYPTION_KEY` está vazio.
3. Troque o `JWT_SECRET` por um valor novo (`openssl rand -hex 32`).
4. Reinicie (`docker compose up -d`).

Efeitos esperados da troca:

- todo mundo precisa entrar de novo (as sessões antigas deixam de valer);
- convites e links de "esqueci a senha" pendentes deixam de valer;
- apps OAuth de terceiros cadastrados na instância (Settings > Developers)
  precisam gerar um novo client secret, e chaves de integração de terceiros
  (Third-Party) precisam ser cadastradas de novo — elas usam a cifra legada
  ligada ao `JWT_SECRET`;
- canais conectados com dados de instância personalizados (campos extras na
  conexão) podem pedir reconexão.

Não troque o `ENCRYPTION_KEY` depois de definido.
