# Regras Semgrep — Robô MultiPost

Regras custom derivadas da auditoria de segurança (ver [`../SECURITY_AUDIT.md`](../SECURITY_AUDIT.md)).
Cobrem os padrões inseguros **recorrentes** encontrados no código, para virarem verificação contínua no CI.

## Rodar localmente

```bash
# instalar: pipx install semgrep  (ou) brew install semgrep
semgrep --config .semgrep/ .
```

## Rodar no CI

```yaml
# .github/workflows/semgrep.yml (exemplo)
name: semgrep
on: [pull_request]
jobs:
  semgrep:
    runs-on: ubuntu-latest
    container: semgrep/semgrep
    steps:
      - uses: actions/checkout@v4
      - run: semgrep ci --config .semgrep/
```

## Regras

| Arquivo | Achado relacionado | O que detecta |
|---|---|---|
| `weak-random-secret.yaml` | B2 | `makeId()`/`Math.random()` gerando tokens/segredos/apiKey |
| `fetch-without-ssrf-dispatcher.yaml` | C1 | `fetch(<url do usuário>)` sem `ssrfSafeDispatcher` |
| `prisma-findunique-without-org.yaml` | A1–A4 | `findFirst`/`findUnique`/`update`/`delete` por `id` sem `organizationId` no `where` |
| `dangerously-set-inner-html-unsanitized.yaml` | C2, C3, C4 | `dangerouslySetInnerHTML` sem `sanitizePostContent`/DOMPurify |
| `jwt-sign-without-expiry.yaml` | B3, B9 | `sign(...)`/`verify(...)` sem `expiresIn`/`algorithms` |
| `prisma-executeraw-unsafe.yaml` | (preventivo) | `$queryRawUnsafe`/`$executeRawUnsafe` com interpolação |

> As regras de fluxo de dados (org-filter, SSRF) são necessariamente heurísticas — tratam-se de
> **auxiliares de revisão**, não de prova formal. Ajuste `paths:`/`pattern-not` conforme os falsos-positivos
> do seu repositório.
