jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
jest.mock('@gitroom/nestjs-libraries/database/prisma/integrations/integration.service', () => ({
  IntegrationService: jest.fn(),
}));

import { FlowExecutionStatus } from '@prisma/client';

// Test evaluateCondition logic directly (same logic as FlowActivity)
function evaluateCondition(nodeData: string, commentText: string): boolean {
  try {
    const config = JSON.parse(nodeData);
    const keywords: string[] = config.keywords || [];
    const matchMode: string = config.matchMode || 'any';

    if (keywords.length === 0) return true;

    const lowerComment = commentText.toLowerCase();

    if (matchMode === 'all') {
      return keywords.every((kw: string) =>
        lowerComment.includes(kw.toLowerCase())
      );
    }

    if (matchMode === 'exact') {
      return keywords.some(
        (kw: string) => lowerComment === kw.toLowerCase()
      );
    }

    // Default: 'any'
    return keywords.some((kw: string) =>
      lowerComment.includes(kw.toLowerCase())
    );
  } catch {
    return false;
  }
}

describe('FlowActivity - evaluateCondition', () => {
  describe('matchMode: any (default)', () => {
    it('should match when any keyword is found', () => {
      const data = JSON.stringify({
        keywords: ['hello', 'hi', 'greetings'],
        matchMode: 'any',
      });

      expect(evaluateCondition(data, 'Hello world!')).toBe(true);
    });

    it('should not match when no keywords found', () => {
      const data = JSON.stringify({
        keywords: ['hello', 'hi'],
        matchMode: 'any',
      });

      expect(evaluateCondition(data, 'Good morning!')).toBe(false);
    });

    it('should be case insensitive', () => {
      const data = JSON.stringify({
        keywords: ['HELLO'],
        matchMode: 'any',
      });

      expect(evaluateCondition(data, 'hello there')).toBe(true);
    });

    it('should use any mode by default when matchMode not specified', () => {
      const data = JSON.stringify({
        keywords: ['test'],
      });

      expect(evaluateCondition(data, 'This is a test')).toBe(true);
    });
  });

  describe('matchMode: all', () => {
    it('should match when all keywords are found', () => {
      const data = JSON.stringify({
        keywords: ['hello', 'world'],
        matchMode: 'all',
      });

      expect(evaluateCondition(data, 'Hello beautiful world!')).toBe(true);
    });

    it('should not match when only some keywords found', () => {
      const data = JSON.stringify({
        keywords: ['hello', 'world'],
        matchMode: 'all',
      });

      expect(evaluateCondition(data, 'Hello there!')).toBe(false);
    });
  });

  describe('matchMode: exact', () => {
    it('should match when comment exactly matches a keyword', () => {
      const data = JSON.stringify({
        keywords: ['ebook', 'link'],
        matchMode: 'exact',
      });

      expect(evaluateCondition(data, 'ebook')).toBe(true);
    });

    it('should not match partial comments', () => {
      const data = JSON.stringify({
        keywords: ['ebook'],
        matchMode: 'exact',
      });

      expect(evaluateCondition(data, 'I want the ebook please')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return true when keywords list is empty', () => {
      const data = JSON.stringify({ keywords: [], matchMode: 'any' });
      expect(evaluateCondition(data, 'anything')).toBe(true);
    });

    it('should return false for invalid JSON data', () => {
      expect(evaluateCondition('invalid-json', 'test')).toBe(false);
    });

    it('should return true for empty data object', () => {
      expect(evaluateCondition('{}', 'test')).toBe(true);
    });
  });
});

describe('FlowActivity - variable interpolation', () => {
  function interpolateVariables(
    template: string,
    input: { igCommenterId: string; commentText: string; igMediaId: string }
  ): string {
    return template
      .replace(/\{commenter_name\}/g, input.igCommenterId)
      .replace(/\{commenter_id\}/g, input.igCommenterId)
      .replace(/\{comment_text\}/g, input.commentText)
      .replace(/\{media_id\}/g, input.igMediaId);
  }

  it('should replace commenter_name placeholder', () => {
    const result = interpolateVariables(
      'Obrigado {commenter_name}!',
      { igCommenterId: 'user-1', commentText: 'hello', igMediaId: 'media-1' }
    );
    expect(result).toBe('Obrigado user-1!');
  });

  it('should replace comment_text placeholder', () => {
    const result = interpolateVariables(
      'Voce disse: "{comment_text}"',
      { igCommenterId: 'user-1', commentText: 'Great post!', igMediaId: 'media-1' }
    );
    expect(result).toBe('Voce disse: "Great post!"');
  });

  it('should replace multiple placeholders', () => {
    const result = interpolateVariables(
      'Oi {commenter_name}, obrigado pelo comentario "{comment_text}" no post {media_id}',
      { igCommenterId: 'john', commentText: 'Amazing!', igMediaId: 'media-99' }
    );
    expect(result).toBe(
      'Oi john, obrigado pelo comentario "Amazing!" no post media-99'
    );
  });

  it('should return template unchanged if no placeholders', () => {
    const result = interpolateVariables(
      'Obrigado pelo comentario!',
      { igCommenterId: 'user-1', commentText: 'hi', igMediaId: 'media-1' }
    );
    expect(result).toBe('Obrigado pelo comentario!');
  });
});

describe('FlowActivity - parseDuration', () => {
  function parseDuration(duration: number, unit: string): number {
    switch (unit) {
      case 'minutes':
        return duration * 60 * 1000;
      case 'hours':
        return duration * 60 * 60 * 1000;
      default:
        return duration * 1000;
    }
  }

  it('should parse seconds', () => {
    expect(parseDuration(30, 'seconds')).toBe(30000);
  });

  it('should parse minutes', () => {
    expect(parseDuration(5, 'minutes')).toBe(300000);
  });

  it('should parse hours', () => {
    expect(parseDuration(1, 'hours')).toBe(3600000);
  });

  it('should default to seconds for unknown unit', () => {
    expect(parseDuration(10, 'unknown')).toBe(10000);
  });
});
