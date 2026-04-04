import { renderPersonaPrompt } from '../helpers/persona.prompt';

describe('renderPersonaPrompt', () => {
  it('returns empty when persona is null', () => {
    expect(renderPersonaPrompt(null)).toBe('');
    expect(renderPersonaPrompt(undefined)).toBe('');
  });

  it('returns empty when all fields blank', () => {
    expect(renderPersonaPrompt({})).toBe('');
    expect(
      renderPersonaPrompt({
        brandDescription: '',
        toneOfVoice: null,
        preferredCtas: [],
        examplePosts: [],
      })
    ).toBe('');
  });

  it('includes only populated fields', () => {
    const result = renderPersonaPrompt({
      brandDescription: 'Weight loss capsules',
      toneOfVoice: 'friendly',
    });
    expect(result).toContain('Brand description: Weight loss capsules');
    expect(result).toContain('Tone of voice: friendly');
    expect(result).not.toContain('Target audience:');
  });

  it('escapes backticks and template literals', () => {
    const result = renderPersonaPrompt({
      brandDescription: 'Buy `now` with ${price}',
    });
    expect(result).not.toContain('`now`');
    expect(result).not.toContain('${price}');
    expect(result).toContain("'now'");
  });

  it('strips script tags', () => {
    const result = renderPersonaPrompt({
      brandDescription: 'Hello <script>alert(1)</script> world',
    });
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
  });

  it('truncates examplePosts to 5', () => {
    const result = renderPersonaPrompt({
      examplePosts: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    expect(result).toContain('Example 5');
    expect(result).not.toContain('Example 6');
  });

  it('renders preferredCtas as bulleted list', () => {
    const result = renderPersonaPrompt({
      preferredCtas: ['Buy now', 'Learn more'],
    });
    expect(result).toContain('- Buy now');
    expect(result).toContain('- Learn more');
  });
});
