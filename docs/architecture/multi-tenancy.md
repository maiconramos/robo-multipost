# Multi-Tenancy — Usuarios, Organizacoes e Perfis

O Robo MultiPost possui um sistema de multi-tenancy em 3 niveis que permite desde uso individual ate agencias gerenciando dezenas de clientes.

## Hierarquia

```
Usuario (conta pessoal)
  └── Organizacao (empresa/agencia)
        └── Perfil (cliente/marca)
              └── Recursos (integracoes, posts, credenciais, webhooks, etc.)
```

Cada nivel isola os dados do nivel abaixo. Um usuario pode pertencer a varias organizacoes, e dentro de cada organizacao pode ter acesso a varios perfis.

---

## 1. Usuario

O usuario e a conta pessoal de login. Cada pessoa tem um unico usuario.

### Como criar

O usuario e criado no **registro** da aplicacao. Ao se registrar, o sistema cria automaticamente:
- O usuario
- Uma organizacao (com o nome da "Company" informada no registro)
- Um perfil "Default" dentro dessa organizacao

### O que o usuario pode fazer

- Pertencer a varias organizacoes (via convite)
- Ter roles diferentes em cada organizacao (SUPERADMIN, ADMIN, USER)
- Alternar entre organizacoes pelo seletor no top bar

---

## 2. Organizacao (Organization)

A organizacao e o "tenant" principal. Ela representa uma empresa, agencia ou grupo de trabalho. Todos os recursos sao vinculados a uma organizacao.

### Como criar

A organizacao e criada **apenas no momento do registro**. Nao existe tela para criar uma segunda organizacao depois de logado.

Para ter acesso a outra organizacao, o caminho e ser **convidado** por um admin dessa org.

### Como convidar membros

1. Acesse **Settings > Team Members**
2. Informe o email do convidado e o role (ADMIN ou USER)
3. O convidado recebe um link por email
4. Ao clicar no link, o usuario e vinculado a organizacao

### Como alternar entre organizacoes

Se o usuario pertence a 2+ organizacoes, um seletor aparece automaticamente no top bar (icone de pessoa). Ao clicar em outra org, a pagina recarrega no contexto da nova organizacao.

Se o usuario tem apenas 1 organizacao, o seletor nao aparece.

### Roles da organizacao

| Role | Permissoes |
|---|---|
| SUPERADMIN | Acesso total, incluindo API key e billing |
| ADMIN | Gerenciar team members, perfis, integracoes e configuracoes |
| USER | Criar e agendar posts, usar integracoes existentes |

---

## 3. Perfil (Profile)

O perfil e um sub-tenant dentro da organizacao. Ele permite isolar recursos entre clientes ou marcas diferentes sem precisar criar organizacoes separadas.

### Como criar

1. Acesse **Settings > Perfis** (requer role ADMIN ou superior)
2. Clique em "Criar Perfil"
3. Informe nome e descricao (opcional)

Ao criar uma organizacao (no registro), um perfil "Default" e criado automaticamente.

### Como alternar entre perfis

Se existem 2+ perfis na organizacao, um seletor aparece no top bar (icone de maleta). Ao clicar em outro perfil, a pagina recarrega no contexto do novo perfil.

Se a organizacao tem apenas 1 perfil, o seletor nao aparece.

### Como gerenciar membros do perfil

1. Acesse **Settings > Perfis**
2. Clique no perfil desejado
3. Adicione membros da organizacao ao perfil com o role desejado

Um usuario so ve os perfis dos quais e membro.

### Roles do perfil

| Role | Permissoes no perfil |
|---|---|
| OWNER | Controle total do perfil, incluindo deletar e gerenciar membros |
| MANAGER | Gerenciar integracoes, credenciais e configuracoes do perfil |
| EDITOR | Criar e agendar posts, usar integracoes existentes |
| VIEWER | Apenas visualizar posts e analytics |

### O que e isolado por perfil

Cada perfil tem seus proprios:

- **Integracoes** — canais de redes sociais conectados
- **Posts** — publicacoes agendadas e publicadas
- **Credenciais OAuth** — tokens de acesso das redes sociais
- **Webhooks** — notificacoes de eventos
- **Auto Post** — regras de publicacao automatica
- **Sets** — conjuntos de canais pre-configurados
- **Late API key** — chave de acesso a API Late (TikTok/Pinterest alternativo)
- **Shortlink** — preferencia de encurtador de links
- **Midia** — biblioteca de imagens e videos
- **Tags** — etiquetas para organizacao de posts

---

## Casos de uso

### Caso 1: Freelancer / Uso pessoal

Joao usa o Robo MultiPost para agendar posts nas suas proprias redes sociais.

**Setup:**
- 1 usuario (Joao)
- 1 organizacao (criada no registro)
- 1 perfil (Default, criado automaticamente)

Joao nunca ve os seletores de org ou perfil. Tudo funciona de forma simples e direta.

### Caso 2: Pequena agencia com poucos clientes

Maria tem uma agencia e gerencia redes sociais de 3 clientes.

**Setup:**
1. Maria se registra → cria org "Agencia da Maria"
2. Cria perfis: "Restaurante Bom Sabor", "Loja Fashion", "Clinica Saude"
3. Conecta as redes sociais de cada cliente no perfil correspondente
4. Alterna entre perfis pelo seletor no top bar

```
Agencia da Maria (org)
  ├── Restaurante Bom Sabor (perfil) → Instagram, Facebook
  ├── Loja Fashion (perfil) → Instagram, TikTok, Pinterest
  └── Clinica Saude (perfil) → Facebook, LinkedIn
```

Quando Maria seleciona "Restaurante Bom Sabor", so ve os posts, integracoes e analytics desse cliente.

### Caso 3: Agencia com equipe

Carlos tem uma agencia maior com funcionarios especializados.

**Setup:**
1. Carlos se registra → cria org "CYA Digital"
2. Cria perfis para cada cliente
3. Convida funcionarios via **Settings > Team Members**
4. Adiciona cada funcionario nos perfis que ele deve gerenciar

```
CYA Digital (org)
  ├── Cliente Premium (perfil)
  │     ├── Carlos (OWNER)
  │     ├── Ana (MANAGER) — gerencia integracoes
  │     └── Pedro (EDITOR) — cria posts
  ├── Cliente Standard (perfil)
  │     ├── Carlos (OWNER)
  │     └── Ana (EDITOR)
  └── Cliente Basico (perfil)
        ├── Carlos (OWNER)
        └── Lucia (EDITOR)
```

- Ana so ve "Cliente Premium" e "Cliente Standard" no seletor
- Pedro so ve "Cliente Premium"
- Lucia so ve "Cliente Basico"
- Carlos ve todos

### Caso 4: Multiplas empresas isoladas

Roberto trabalha como freelancer para 2 agencias diferentes que nao devem ver os dados uma da outra.

**Setup:**
1. Roberto se registra → cria org "Roberto Freelancer"
2. Agencia A convida Roberto para a org dela
3. Agencia B convida Roberto para a org dela

```
Roberto Freelancer (org) → projetos pessoais do Roberto
Agencia A (org) → Roberto ve os perfis que tem acesso
Agencia B (org) → Roberto ve os perfis que tem acesso
```

Roberto alterna entre organizacoes pelo seletor de org (icone de pessoa) e entre perfis pelo seletor de perfil (icone de maleta).

---

## Resumo visual

```
┌─────────────────────────────────────────────────┐
│                    USUARIO                       │
│              (conta de login)                    │
│                                                  │
│  ┌──────────────┐    ┌──────────────┐           │
│  │   Org A       │    │   Org B       │          │
│  │  (agencia)    │    │  (empresa)    │          │
│  │               │    │               │          │
│  │ ┌──────────┐  │    │ ┌──────────┐  │          │
│  │ │ Perfil 1 │  │    │ │ Perfil 1 │  │          │
│  │ │ Cliente X│  │    │ │ Default  │  │          │
│  │ └──────────┘  │    │ └──────────┘  │          │
│  │ ┌──────────┐  │    └──────────────┘           │
│  │ │ Perfil 2 │  │                               │
│  │ │ Cliente Y│  │                               │
│  │ └──────────┘  │                               │
│  └──────────────┘                                │
└─────────────────────────────────────────────────┘

Seletor de Org     → icone de pessoa (top bar)
Seletor de Perfil  → icone de maleta (top bar)
```

---

## Perguntas frequentes

**Posso criar uma organizacao depois de registrado?**
Nao. A organizacao e criada apenas no registro. Para acessar outra org, voce precisa ser convidado.

**Preciso criar perfis se sou o unico usuario?**
Nao. O perfil "Default" e criado automaticamente. Se voce nao precisa separar clientes/marcas, use apenas o perfil default.

**O que acontece se eu deletar um perfil?**
O perfil e marcado como deletado (soft delete). Os dados associados (posts, integracoes) permanecem no banco mas nao ficam mais acessiveis.

**Posso mover integracoes de um perfil para outro?**
Atualmente nao existe funcionalidade automatica para isso. Seria necessario desconectar e reconectar a integracao no novo perfil.

**Quantos perfis posso criar?**
Nao ha limite tecnico. O limite pratico depende do seu plano e da quantidade de canais disponíveis.

**Ao atualizar de uma versao anterior, meus dados sao migrados?**
Sim. O sistema roda uma migracao automatica no startup que move todos os dados existentes para o perfil "Default" da organizacao. Nenhuma acao manual e necessaria.
