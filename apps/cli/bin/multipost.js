#!/usr/bin/env node
/*
 * Robô MultiPost — CLI/skill para agentes de IA.
 *
 * Wrapper fino e sem dependências sobre a API pública (/public/v1/*) de uma
 * instância self-hosted. Inclui automações de comentário (flows), que o CLI
 * oficial do Postiz não tem.
 *
 * Configuração (env):
 *   MULTIPOST_API_KEY  (ou POSTIZ_API_KEY)  — chave de API (org OU perfil)
 *   MULTIPOST_API_URL  (ou POSTIZ_API_URL)  — URL do backend self-hosted
 *
 * Toda saída de sucesso é JSON no stdout (para o agente parsear). Erros vão
 * para o stderr e o processo sai com código 1.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.MULTIPOST_API_KEY || process.env.POSTIZ_API_KEY;
const API_URL = (
  process.env.MULTIPOST_API_URL ||
  process.env.POSTIZ_API_URL ||
  ''
).replace(/\/+$/, '');

function fail(msg, extra) {
  process.stderr.write(
    JSON.stringify({ ok: false, error: msg, ...(extra || {}) }, null, 2) + '\n'
  );
  process.exit(1);
}

function out(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

// --- parser de flags simples: --chave valor / --flag (boolean) ---
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    }
  }
  return flags;
}

function ensureConfig() {
  if (!API_KEY) fail('MULTIPOST_API_KEY (ou POSTIZ_API_KEY) não definida.');
  if (!API_URL)
    fail(
      'MULTIPOST_API_URL (ou POSTIZ_API_URL) não definida. Aponte para o seu backend self-hosted, ex.: https://localmultipostapi.seu-dominio.com.br'
    );
}

function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.append(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, endpoint, { query, body, formData } = {}) {
  ensureConfig();
  const url = `${API_URL}${endpoint}${qs(query)}`;
  const headers = { Authorization: API_KEY };
  let payload;
  if (formData) {
    payload = formData; // fetch define o Content-Type multipart automaticamente
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch (e) {
    fail(`Falha de rede ao chamar ${method} ${url}`, { detail: String(e) });
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    fail(`HTTP ${res.status} em ${method} ${endpoint}`, { response: json });
  }
  return json;
}

function parseJsonFlag(flags, name) {
  if (!flags[name]) fail(`--${name} é obrigatório (JSON do corpo da requisição).`);
  try {
    return JSON.parse(flags[name]);
  } catch (e) {
    fail(`--${name} não é JSON válido.`, { detail: String(e) });
  }
}

const commands = {
  'profiles:list': async () => out(await request('GET', '/public/v1/profiles')),

  'integrations:list': async (f) =>
    out(
      await request('GET', '/public/v1/integrations', {
        query: { profileId: f.profileId },
      })
    ),

  'posts:list': async (f) => {
    if (!f.startDate || !f.endDate)
      fail('posts:list exige --startDate e --endDate (ISO 8601).');
    out(
      await request('GET', '/public/v1/posts', {
        query: { startDate: f.startDate, endDate: f.endDate, customer: f.customer },
      })
    );
  },

  'posts:create': async (f) => {
    // Primário: --json com o corpo completo (ver SKILL.md / Swagger /docs).
    // Conveniência: --content + --integrationId (+ --date, --type) para 1 post simples.
    let body;
    if (f.json) {
      body = parseJsonFlag(f, 'json');
    } else {
      if (!f.content || !f.integrationId)
        fail(
          'posts:create exige --json OU (--content e --integrationId). Veja SKILL.md.'
        );
      const type = f.type || (f.date ? 'schedule' : 'now');
      body = {
        type,
        date: f.date || new Date().toISOString(),
        shortLink: false,
        tags: [],
        posts: [
          {
            integration: { id: f.integrationId },
            value: [{ content: f.content }],
            settings: {},
          },
        ],
      };
    }
    out(await request('POST', '/public/v1/posts', { body }));
  },

  'posts:delete': async (f) => {
    if (!f.id) fail('posts:delete exige --id.');
    out(await request('DELETE', `/public/v1/posts/${f.id}`));
  },

  'flows:list': async (f) =>
    out(
      await request('GET', '/public/v1/flows', {
        query: { integrationId: f.integrationId, profileId: f.profileId },
      })
    ),

  'flows:get': async (f) => {
    if (!f.id) fail('flows:get exige --id.');
    out(await request('GET', `/public/v1/flows/${f.id}`));
  },

  'flows:create': async (f) =>
    out(await request('POST', '/public/v1/flows', { body: parseJsonFlag(f, 'json') })),

  'flows:update': async (f) => {
    if (!f.id) fail('flows:update exige --id.');
    out(
      await request('PUT', `/public/v1/flows/${f.id}`, {
        body: parseJsonFlag(f, 'json'),
      })
    );
  },

  'flows:status': async (f) => {
    if (!f.id || !f.status)
      fail('flows:status exige --id e --status (DRAFT|ACTIVE|PAUSED|ARCHIVED).');
    out(
      await request('POST', `/public/v1/flows/${f.id}/status`, {
        body: { status: f.status },
      })
    );
  },

  'flows:delete': async (f) => {
    if (!f.id) fail('flows:delete exige --id.');
    out(await request('DELETE', `/public/v1/flows/${f.id}`));
  },

  'upload:url': async (f) => {
    if (!f.url) fail('upload:url exige --url.');
    out(await request('POST', '/public/v1/upload-from-url', { body: { url: f.url } }));
  },

  'upload:file': async (f) => {
    if (!f.file) fail('upload:file exige --file <caminho>.');
    const abs = path.resolve(f.file);
    if (!fs.existsSync(abs)) fail(`Arquivo não encontrado: ${abs}`);
    const buf = fs.readFileSync(abs);
    const fd = new FormData();
    fd.append('file', new Blob([buf]), path.basename(abs));
    out(await request('POST', '/public/v1/upload', { formData: fd }));
  },

  analytics: async (f) => {
    if (!f.integration) fail('analytics exige --integration <id> (e opcional --days, padrão 7).');
    out(
      await request('GET', `/public/v1/analytics/${f.integration}`, {
        query: { date: f.days || 7 },
      })
    );
  },

  'is-connected': async () => out(await request('GET', '/public/v1/is-connected')),
};

const HELP = `Robô MultiPost — CLI para agentes

Config (env):
  MULTIPOST_API_KEY (ou POSTIZ_API_KEY)   chave de API (org ou perfil)
  MULTIPOST_API_URL (ou POSTIZ_API_URL)   URL do backend self-hosted

Comandos:
  is-connected                              valida chave/URL
  profiles:list                             lista perfis (id, name, isDefault)
  integrations:list [--profileId ID]        lista canais conectados
  posts:list --startDate ISO --endDate ISO  lista posts no período
  posts:create --content "..." --integrationId ID [--date ISO] [--type draft|schedule|now]
  posts:create --json '<corpo completo>'    (avançado; ver Swagger /docs)
  posts:delete --id ID
  flows:list [--integrationId ID]           lista automações de comentário
  flows:get --id ID
  flows:create --json '<corpo>'             cria automação (ver SKILL.md)
  flows:update --id ID --json '<corpo>'
  flows:status --id ID --status ACTIVE|PAUSED|ARCHIVED|DRAFT
  flows:delete --id ID
  upload:url --url URL                      baixa e salva mídia de uma URL
  upload:file --file CAMINHO                envia um arquivo local
  analytics --integration ID [--days 7]

Saída: JSON no stdout. Erros: JSON no stderr + exit 1.
`;

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP);
    return;
  }
  const handler = commands[cmd];
  if (!handler) {
    fail(`Comando desconhecido: ${cmd}. Rode "multipost help".`);
  }
  await handler(parseFlags(rest));
}

main().catch((e) => fail('Erro inesperado', { detail: String(e && e.stack || e) }));
