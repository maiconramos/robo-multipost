export interface PersonaLike {
  brandDescription?: string | null;
  toneOfVoice?: string | null;
  writingInstructions?: string | null;
  preferredCtas?: string[] | null;
  contentRestrictions?: string | null;
  imageStyle?: string | null;
  targetAudience?: string | null;
  examplePosts?: string[] | null;
}

// Escape template-literal/prompt-injection characters so that persona free-text
// cannot break out of the enclosing system prompt or inject backticks / ${}.
const sanitize = (raw: unknown): string => {
  if (raw == null) return '';
  const str = String(raw);
  return str
    .replace(/`/g, "'")
    .replace(/\$\{/g, '$ {')
    .replace(/<\/?(script|style|iframe)[^>]*>/gi, '')
    .trim();
};

const sanitizeList = (list: unknown): string[] => {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => sanitize(s))
    .filter(Boolean);
};

export const renderPersonaPrompt = (persona: PersonaLike | null | undefined): string => {
  if (!persona) return '';

  const brand = sanitize(persona.brandDescription);
  const tone = sanitize(persona.toneOfVoice);
  const writing = sanitize(persona.writingInstructions);
  const restrictions = sanitize(persona.contentRestrictions);
  const audience = sanitize(persona.targetAudience);
  const imageStyle = sanitize(persona.imageStyle);
  const ctas = sanitizeList(persona.preferredCtas);
  const examples = sanitizeList(persona.examplePosts).slice(0, 5);

  const hasAny =
    brand || tone || writing || restrictions || audience || imageStyle ||
    ctas.length > 0 || examples.length > 0;
  if (!hasAny) return '';

  const sections: string[] = [];
  sections.push('=== PROFILE PERSONA (follow these rules for ALL generated content) ===');
  if (brand) sections.push(`Brand description: ${brand}`);
  if (audience) sections.push(`Target audience: ${audience}`);
  if (tone) sections.push(`Tone of voice: ${tone}`);
  if (writing) sections.push(`Writing instructions: ${writing}`);
  if (ctas.length > 0) {
    sections.push('Preferred calls-to-action (rotate between them):');
    sections.push(ctas.map((c) => `- ${c}`).join('\n'));
  }
  if (restrictions) sections.push(`Content restrictions (NEVER violate): ${restrictions}`);
  if (imageStyle) sections.push(`Image style: ${imageStyle}`);
  if (examples.length > 0) {
    sections.push('Example posts (reference tone and style, do not copy verbatim):');
    sections.push(examples.map((p, i) => `Example ${i + 1}:\n${p}`).join('\n\n'));
  }
  sections.push('=== END PROFILE PERSONA ===');
  return sections.join('\n');
};
