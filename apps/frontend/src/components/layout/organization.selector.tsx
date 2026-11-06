'use client';

import React, { FC, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const OrganizationSelector: FC<{ asOpenSelect?: boolean }> = ({
  asOpenSelect,
}) => {
  const fetch = useFetch();
  const t = useT();
  const user = useUser();
  const load = useCallback(async () => {
    return await (await fetch('/user/organizations')).json();
  }, []);
  const { isLoading, data } = useSWR('organizations', load, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
    revalidateOnReconnect: false,
  });
  const changeOrg = useCallback(
    (org: { name: string; id: string }) => async () => {
      await fetch('/user/change-org', {
        method: 'POST',
        body: JSON.stringify({
          id: org.id,
        }),
      });
      window.location.reload();
    },
    [fetch]
  );
  if (isLoading || (!isLoading && data?.length === 1)) {
    return null;
  }
  if (!Array.isArray(data)) return null;
  return (
    <select
      aria-label={t('label_select_organization', 'Select organization')}
      value={user?.orgId || ''}
      onChange={(event) =>
        void changeOrg({ id: event.target.value, name: '' })()
      }
      className={
        asOpenSelect
          ? 'w-full max-w-[500px] min-h-[44px] px-[12px] bg-btnPrimary text-white rounded-[8px]'
          : 'max-w-[200px] min-h-[44px] bg-newBgColorInner text-newTextColor border border-newBorder rounded-[8px] px-[8px] text-[12px] truncate'
      }
    >
      {!data.some((org: { id: string }) => org.id === user?.orgId) && (
        <option value="" disabled>
          {t('label_select_organization', 'Select organization')}
        </option>
      )}
      {data.map((org: { name: string; id: string }) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
};
