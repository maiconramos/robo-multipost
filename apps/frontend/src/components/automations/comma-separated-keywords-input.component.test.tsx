import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommaSeparatedKeywordsInput,
  parseKeywordsInput,
} from './comma-separated-keywords-input.component';

afterEach(cleanup);

describe('CommaSeparatedKeywordsInput', () => {
  it('keeps a trailing comma visible so another keyword can be typed', () => {
    const onKeywordsChange = vi.fn();
    const Harness = () => {
      const [keywords, setKeywords] = React.useState(['Hermes']);

      return (
        <CommaSeparatedKeywordsInput
          aria-label="Palavras-chave"
          keywords={keywords}
          onKeywordsChange={(nextKeywords) => {
            onKeywordsChange(nextKeywords);
            setKeywords(nextKeywords);
          }}
        />
      );
    };
    const { getByRole } = render(<Harness />);
    const input = getByRole('textbox') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Hermes,' } });

    expect(input.value).toBe('Hermes,');
    expect(onKeywordsChange).toHaveBeenLastCalledWith(['Hermes']);

    fireEvent.change(input, { target: { value: 'Hermes, herme' } });

    expect(input.value).toBe('Hermes, herme');
    expect(onKeywordsChange).toHaveBeenLastCalledWith(['Hermes', 'herme']);
  });

  it('synchronizes the text when a keyword is added externally', async () => {
    const onKeywordsChange = vi.fn();
    const { getByRole, rerender } = render(
      <CommaSeparatedKeywordsInput
        aria-label="Palavras-chave"
        keywords={['Hermes']}
        onKeywordsChange={onKeywordsChange}
      />
    );

    rerender(
      <CommaSeparatedKeywordsInput
        aria-label="Palavras-chave"
        keywords={['Hermes', 'Preço']}
        onKeywordsChange={onKeywordsChange}
      />
    );

    await waitFor(() => {
      expect((getByRole('textbox') as HTMLInputElement).value).toBe(
        'Hermes, Preço'
      );
    });
  });
});

describe('parseKeywordsInput', () => {
  it('ignores empty segments and trims each keyword', () => {
    expect(parseKeywordsInput(' Hermes, , preço ,comprar ')).toEqual([
      'Hermes',
      'preço',
      'comprar',
    ]);
  });
});
