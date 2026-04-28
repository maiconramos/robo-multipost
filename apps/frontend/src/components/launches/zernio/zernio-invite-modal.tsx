'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useZernioProfiles } from '@gitroom/frontend/hooks/use-zernio-profiles.hook';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  PLATFORM_NAMES,
  PlatformIcon,
} from '@gitroom/frontend/components/launches/zernio/zernio-account-modal';

export const ZernioInviteModal: FC<{
  onComplete: (url: string) => void;
}> = ({ onComplete }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [generating, setGenerating] = useState(false);

  const { data: profilesData, isLoading: profilesLoading } =
    useZernioProfiles();

  const profiles = profilesData?.profiles || [];
  const autoSelectedProfileId = useMemo(() => {
    if (profiles.length === 1) return profiles[0]._id;
    return null;
  }, [profiles]);

  const effectiveProfileId = selectedProfileId || autoSelectedProfileId;

  const handleSelectPlatform = useCallback(
    async (platform: string) => {
      if (!effectiveProfileId || generating) return;
      setGenerating(true);

      try {
        const response = await fetch('/integrations/zernio/invite-link', {
          method: 'POST',
          body: JSON.stringify({
            profileId: effectiveProfileId,
            platform,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          toaster.show(
            err.message ||
              t(
                'failed_to_create_invite_link',
                'Failed to create invite link'
              ),
            'warning'
          );
          return;
        }

        const data = await response.json();
        const url = data.invite?.inviteUrl || data.inviteUrl || data.url;

        if (url) {
          onComplete(url);
        } else {
          toaster.show(
            t('failed_to_create_invite_link', 'Failed to create invite link'),
            'warning'
          );
        }
      } catch {
        toaster.show(
          t('failed_to_create_invite_link', 'Failed to create invite link'),
          'warning'
        );
      } finally {
        setGenerating(false);
      }
    },
    [effectiveProfileId, generating]
  );

  // Step 1: Profile selection (if multiple profiles)
  if (!effectiveProfileId) {
    return (
      <div className="flex flex-col gap-[16px] pt-[8px]">
        {profilesLoading ? (
          <div className="flex justify-center py-[20px]">
            <div className="w-[32px] h-[32px] border-[3px] border-buttonColor border-t-transparent rounded-full animate-spin" />
          </div>
        ) : profiles.length === 0 ? (
          <p className="text-[14px] text-textColor/60 text-center py-[20px]">
            {t(
              'no_zernio_profiles_found',
              'No Zernio profiles found. Make sure your Zernio API key is configured in Settings.'
            )}
          </p>
        ) : (
          <>
            <p className="text-[14px] text-textColor/80">
              {t(
                'select_zernio_profile',
                'Select a Zernio profile to see connected accounts:'
              )}
            </p>
            <div className="flex flex-col gap-[8px]">
              {profiles.map((profile) => (
                <button
                  key={profile._id}
                  onClick={() => setSelectedProfileId(profile._id)}
                  className="flex items-center gap-[12px] p-[12px] rounded-[8px] bg-newTableHeader hover:bg-tableBorder transition-colors cursor-pointer text-start"
                >
                  <div className="flex-1">
                    <div className="text-[14px] font-medium text-textColor">
                      {profile.name}
                    </div>
                  </div>
                  {profile.isDefault && (
                    <span className="text-[11px] px-[8px] py-[2px] rounded-full bg-buttonColor text-white">
                      {t('default_profile_badge', 'Default')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Step 2: Platform selection
  const platforms = Object.entries(PLATFORM_NAMES);

  return (
    <div className="flex flex-col gap-[16px] pt-[8px]">
      {profiles.length > 1 && (
        <button
          onClick={() => setSelectedProfileId(null)}
          className="flex items-center gap-[4px] text-[13px] text-textColor/60 hover:text-textColor cursor-pointer"
        >
          &larr; {t('back_to_profiles', 'Back to profiles')}
        </button>
      )}

      <p className="text-[13px] text-textColor/60">
        {t(
          'select_platform_for_invite',
          'Select the platform to generate the invite link:'
        )}
      </p>

      {generating ? (
        <div className="flex flex-col items-center gap-[8px] py-[20px]">
          <div className="w-[32px] h-[32px] border-[3px] border-buttonColor border-t-transparent rounded-full animate-spin" />
          <p className="text-[13px] text-textColor/60">
            {t('generating_invite_link', 'Generating invite link...')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-[8px]">
          {platforms.map(([id, name]) => (
            <button
              key={id}
              onClick={() => handleSelectPlatform(id)}
              className="flex flex-col items-center gap-[6px] p-[10px] rounded-[8px] bg-newTableHeader hover:bg-tableBorder transition-colors cursor-pointer"
            >
              <PlatformIcon platform={id} size={24} />
              <span className="text-[11px] text-textColor/80 text-center leading-tight">
                {name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
