'use client';

import React, { FC, useCallback, useMemo } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import clsx from 'clsx';

export const ProfileSelector: FC = () => {
  const fetch = useFetch();
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
  const current = useMemo(() => {
    return data?.find((d: any) => d.id === user?.profileId);
  }, [data, user?.profileId]);
  const withoutCurrent = useMemo(() => {
    return data?.filter((d: any) => d.id !== user?.profileId);
  }, [current, data]);
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
    []
  );
  if (isLoading || (!isLoading && (!data || data?.length <= 1))) {
    return null;
  }
  return (
    <>
      <div className="hover:text-newTextColor">
        <div className="group text-[12px] relative">
          <div className="flex items-center gap-[4px] cursor-pointer">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M20 7H4C3.44772 7 3 7.44772 3 8V19C3 19.5523 3.44772 20 4 20H20C20.5523 20 21 19.5523 21 19V8C21 7.44772 20.5523 7 20 7Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M16 7V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.96086 8 4.46957 8 5V7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="max-w-[80px] truncate">
              {current?.name || user?.profileName || 'Perfil'}
            </span>
          </div>
          <div
            className="hidden py-[12px] px-[12px] group-hover:flex absolute top-[100%] end-0 bg-third border-tableBorder border gap-[12px] cursor-pointer flex-col z-[100]"
          >
            {data?.map((profile: { name: string; id: string }) => (
              <div
                key={profile.id}
                onClick={changeProfile(profile)}
                className={clsx(
                  'whitespace-nowrap',
                  profile.id === user?.profileId && 'font-bold'
                )}
              >
                {profile.name}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="w-[1px] h-[20px] bg-blockSeparator" />
    </>
  );
};
