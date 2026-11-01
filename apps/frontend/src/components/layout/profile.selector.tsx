'use client';

import React, { FC, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const ProfileSelector: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const user = useUser();
  const load = useCallback(async () => {
    return await (await fetch('/user/profiles')).json();
  }, []);
  const { isLoading, data } = useSWR('profiles', load, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
    revalidateOnReconnect: false,
  });
  const changeProfile = useCallback(
    (profile: { name: string; id: string }) => async () => {
      await fetch('/user/change-profile', {
        method: 'POST',
        body: JSON.stringify({
          id: profile.id,
        }),
      });
      window.location.reload();
    },
    [fetch]
  );
  if (isLoading || (!isLoading && (!data || data?.length <= 1))) {
    return null;
  }
  if (!Array.isArray(data)) return null;
  return (
    <select
      aria-label={t('select_profile', 'Select profile')}
      value={user?.profileId || ''}
      onChange={(event) =>
        void changeProfile({ id: event.target.value, name: '' })()
      }
      className="max-w-[160px] mobile:max-w-[110px] min-h-[44px] bg-newBgColorInner text-newTextColor border border-newBorder rounded-[8px] px-[8px] text-[12px] truncate"
    >
      {!data.some(
        (profile: { id: string }) => profile.id === user?.profileId
      ) && (
        <option value="" disabled>
          {t('select_profile', 'Select profile')}
        </option>
      )}
      {data.map((profile: { name: string; id: string }) => (
        <option key={profile.id} value={profile.id}>
          {profile.name}
        </option>
      ))}
    </select>
  );
};
