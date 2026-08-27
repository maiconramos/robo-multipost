'use client';

import React, {
  ChangeEvent,
  FocusEvent,
  InputHTMLAttributes,
  useEffect,
  useState,
} from 'react';

export function parseKeywordsInput(value: string): string[] {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function sameKeywords(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((keyword, index) => keyword === right[index])
  );
}

interface CommaSeparatedKeywordsInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  keywords: string[];
  onKeywordsChange: (keywords: string[]) => void;
}

export function CommaSeparatedKeywordsInput({
  keywords,
  onKeywordsChange,
  onBlur,
  ...inputProps
}: CommaSeparatedKeywordsInputProps) {
  const [rawValue, setRawValue] = useState(() => keywords.join(', '));

  useEffect(() => {
    // Preserve separators and spaces while the user is still typing. Sync only
    // when the keyword list was changed externally, such as by an example chip.
    if (!sameKeywords(parseKeywordsInput(rawValue), keywords)) {
      setRawValue(keywords.join(', '));
    }
  }, [keywords, rawValue]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setRawValue(value);
    onKeywordsChange(parseKeywordsInput(value));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setRawValue(keywords.join(', '));
    onBlur?.(event);
  };

  return (
    <input
      {...inputProps}
      type="text"
      value={rawValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
