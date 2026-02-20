# Alterações Manuais de Logo — Robô MultiPost

Este documento lista os arquivos de logo que precisam ser alterados manualmente para completar o rebranding do projeto.

---

## 1. Logo em Texto

**Arquivo:** `apps/frontend/src/components/ui/logo-text.component.tsx`

**Conteúdo atual:** Componente React (`LogoTextComponent`) que renderiza um SVG (101x33 viewBox) com múltiplos elementos `<path>` desenhando o texto "Postiz" como gráfico vetorial. O SVG inclui o ícone estilizado do "P" com cor roxa (#612BD3) e os caracteres "ostiz" em branco.

**O que deve ser alterado:**
- Substituir o SVG inteiro por um componente de texto simples exibindo "Robô MultiPost", por exemplo:
  ```tsx
  export const LogoTextComponent = () => {
    return (
      <span className="text-[20px] font-semibold text-current whitespace-nowrap">
        Robô MultiPost
      </span>
    );
  };
  ```
- Alternativamente, criar um novo SVG customizado com a tipografia da marca "Robô MultiPost".
- Manter o nome do componente `LogoTextComponent` e o mesmo padrão de exportação.

---

## 2. Ícone/Logo (Sidebar e Navegação)

**Arquivo:** `apps/frontend/src/components/new-layout/logo.tsx`

**Conteúdo atual:** Componente React client-side (`Logo`) que renderiza um SVG (60x60 viewBox) com o ícone estilizado da letra "P" do Postiz, incluindo o fundo roxo (#612BD3) e a letra em branco. Usa a classe CSS `mt-[8px]`.

**O que deve ser alterado:**
- Substituir o SVG do "P" por um novo logo oficial do Robô MultiPost (SVG, PNG ou emoji 🤖).
- Manter as dimensões de 60x60px do container para compatibilidade com o layout da sidebar.
- Exemplo de substituição com emoji:
  ```tsx
  'use client';

  export const Logo = () => {
    return (
      <div className="mt-[8px] min-w-[60px] min-h-[60px] w-[60px] h-[60px] flex items-center justify-center text-[36px]">
        <span role="img" aria-label="robot">🤖</span>
      </div>
    );
  };
  ```
- Exemplo de substituição com imagem:
  ```tsx
  import Image from 'next/image';

  export const Logo = () => {
    return (
      <div className="mt-[8px] min-w-[60px] min-h-[60px] w-[60px] h-[60px] flex items-center justify-center">
        <Image src="/logo-robo-multipost.svg" width={48} height={48} alt="Robô MultiPost" />
      </div>
    );
  };
  ```
- O arquivo de imagem do logo deve ser colocado em `apps/frontend/public/`.

---

## Resumo

| Arquivo | Tipo | Status Atual |
|---|---|---|
| `apps/frontend/src/components/ui/logo-text.component.tsx` | Texto do logo | SVG do Postiz — precisa ser substituído |
| `apps/frontend/src/components/new-layout/logo.tsx` | Ícone do logo | SVG do "P" do Postiz — precisa ser substituído |
