#!/bin/bash
# Hook: bloqueia gh pr <mutating> sem --repo maiconramos/robo-multipost
# Motivo: este repo e fork de gitroomhq/postiz-app. Sem --repo, gh CLI
# resolve PRs contra o upstream e PRs internos do fork acabam expostos
# no repositorio publico do Postiz (incidente real: PR #1509 em
# gitroomhq/postiz-app, ver feedback_gh_pr_repo.md).

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')

# So bloqueia comandos mutating de PR (create/edit/merge/close/ready/review/comment/reopen).
# Comandos read-only (view, list, diff, checks, status) continuam livres.
if echo "$cmd" | grep -qE '\bgh[[:space:]]+pr[[:space:]]+(create|edit|merge|close|ready|review|comment|reopen)\b'; then
  if ! echo "$cmd" | grep -qE -- '--repo[[:space:]]+maiconramos/robo-multipost\b'; then
    echo 'BLOQUEADO: gh pr <create|edit|merge|close|ready|review|comment|reopen> SEM --repo maiconramos/robo-multipost.' >&2
    echo 'Este repo e fork de gitroomhq/postiz-app; sem --repo, o comando vai contra o upstream publico.' >&2
    echo 'Reescreva: gh pr <subcomando> --repo maiconramos/robo-multipost --base main --head <branch> ...' >&2
    exit 2
  fi
fi

exit 0
