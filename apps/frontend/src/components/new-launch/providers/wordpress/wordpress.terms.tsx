'use client';

import { FC, useEffect, useState } from 'react';
import { MultiSelect } from '@gitroom/react/form/multi.select';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

type WordpressTerm = { id: number; name: string };
type WordpressTermFunction = 'categoriesList' | 'tagsList';

export const WordpressTerms: FC<{
  name: string;
  label: string;
  func: WordpressTermFunction;
}> = ({ name, label, func }) => {
  const { get } = useCustomProviderFunction();
  const form = useSettings();
  const { getValues, setValue } = form;
  const [terms, setTerms] = useState<WordpressTerm[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    get(func)
      .then((data) => {
        if (active) {
          setTerms(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (active) {
          setTerms([]);
        }
      });

    const settings = getValues(name);
    if (Array.isArray(settings)) {
      setSelected(
        settings
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0)
      );
    }

    return () => {
      active = false;
    };
  }, [func, get, getValues, name]);

  const onChangeInner = (value: Array<string | number>) => {
    const numbers = [
      ...new Set(
        value
          .map((current) => Number(current))
          .filter((current) => Number.isInteger(current) && current > 0)
      ),
    ];
    setSelected(numbers);
    setValue(name, numbers, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  if (!terms.length) {
    return null;
  }

  return (
    <MultiSelect
      label={label}
      name={name}
      onChange={onChangeInner}
      options={terms.map((term) => ({ label: term.name, value: term.id }))}
      value={selected}
    />
  );
};
