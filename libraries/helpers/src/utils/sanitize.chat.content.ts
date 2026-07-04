import DOMPurify from 'isomorphic-dompurify';

// O chat de IA transforma marcadores de texto em HTML de midia
// (agent.chat.tsx -> convertContentToImagesAndVideo). SO essas tags/attrs sao
// produzidas pelos nossos templates; qualquer outro HTML no conteudo (ecoado
// pela IA a partir de busca web / comentarios do IG / dados de integracao) e
// removido. Mantido separado de sanitizePostContent para nao alargar o
// sanitizador de posts (usado no DTO de post e na pre-visualizacao publica).
const ALLOWED_TAGS = ['div', 'img', 'video', 'source'];
const ALLOWED_ATTR = ['src', 'controls', 'type', 'class'];

// `class` so e mantido nos valores fixos usados pelos templates de midia do
// chat. Impede injecao de <div class="fixed inset-0 z-50 ...">, que renderiza
// como overlay estilizado dentro do chat confiavel (UI-spoofing/phishing),
// mesmo sem execucao de script. Manter em paridade com os templates de
// `convertContentToImagesAndVideo` em agent.chat.tsx.
const ALLOWED_CLASS_VALUES = new Set([
  'h-[150px] w-[150px] rounded-[8px] mb-[10px]', // <video>
  'h-[150px] w-[150px] max-w-full border border-newBgColorInner', // <img>
  'flex justify-center mt-[20px]', // <div> wrapper [--Media--]
]);

const stripForSchemeCheck = (raw: string): string =>
  raw.replace(/\s+/g, '').toLowerCase();

export const sanitizeChatContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (
      data.attrName === 'class' &&
      !ALLOWED_CLASS_VALUES.has(data.attrValue)
    ) {
      data.keepAttr = false;
      return;
    }
    // `src` deve ser http(s) absoluto. ALLOWED_URI_REGEXP sozinho NAO basta:
    // o DOMPurify tem um fallback interno (DATA_URI_TAGS) que aceita `data:`
    // em img/video/source mesmo quando o regex reprova. Impomos o esquema
    // aqui (removendo espacos para evitar ofuscacao) para bloquear `data:`
    // (payloads inline, SVG) e demais esquemas.
    if (data.attrName === 'src') {
      const normalized = stripForSchemeCheck(data.attrValue);
      if (!/^https?:\/\//.test(normalized)) {
        data.keepAttr = false;
      }
    }
  });

  try {
    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // Primeira barreira de esquema (javascript:/vbscript:/relativo). O
      // reforco de `src` acima cobre o `data:` que este regex nao bloqueia.
      ALLOWED_URI_REGEXP: /^https?:\/\//i,
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
};
