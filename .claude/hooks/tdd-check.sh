#!/bin/bash
# Hook: verifica se commits de codigo de producao incluem testes (.spec.ts)
# Usado como PreToolUse hook no settings.json do Claude Code

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')

# So verificar em comandos git commit
if echo "$cmd" | grep -qE '^git commit'; then
  specs=$(git diff --cached --name-only | grep -cE '\.spec\.ts$' || true)
  sources=$(git diff --cached --name-only | grep -E '\.(service|repository|provider)\.ts$' | grep -vcE '\.spec\.ts$' || true)

  if [ "$sources" -gt 0 ] && [ "$specs" -eq 0 ]; then
    echo 'ALERTA TDD: Voce esta commitando codigo de producao (service/repository/provider) sem nenhum arquivo .spec.ts. Siga o ciclo Red-Green-Refactor e inclua os testes.' >&2
    exit 2
  fi
fi

exit 0
