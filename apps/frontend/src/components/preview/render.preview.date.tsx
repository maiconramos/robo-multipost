'use client';

import { FC } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import 'dayjs/locale/pt-br';
import { useTranslation } from 'react-i18next';

dayjs.extend(utc);
dayjs.extend(localizedFormat);

export const RenderPreviewDate: FC<{ date: string }> = ({ date }) => {
  const { i18n } = useTranslation();
  const lang = i18n.language?.toLowerCase().startsWith('pt') ? 'pt-br' : 'en';
  return <>{dayjs.utc(date).local().locale(lang).format('LLL')}</>;
};
