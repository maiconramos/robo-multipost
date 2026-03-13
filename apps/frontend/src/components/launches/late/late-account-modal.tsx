'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useLateProfiles } from '@gitroom/frontend/hooks/use-late-profiles.hook';
import {
  useLateAccounts,
  LateAccount,
} from '@gitroom/frontend/hooks/use-late-accounts.hook';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import Image from 'next/image';
import { getPlatformIconPath } from '@gitroom/frontend/components/launches/helpers/platform-icon.helper';

export const PLATFORM_NAMES: Record<string, string> = {
  twitter: 'Twitter/X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  reddit: 'Reddit',
  bluesky: 'Bluesky',
  threads: 'Threads',
  googlebusiness: 'Google Business',
  telegram: 'Telegram',
  snapchat: 'Snapchat',
};

export const PlatformIcon: FC<{ platform: string; size?: number }> = ({
  platform,
  size = 24,
}) => {
  const iconPath = getPlatformIconPath(platform);
  return (
    <Image
      src={iconPath}
      alt={platform}
      width={size}
      height={size}
      className="rounded-full"
    />
  );
};

export const LateAccountModal: FC<{
  onComplete: () => void;
}> = ({ onComplete }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [connecting, setConnecting] = useState(false);

  const { data: profilesData, isLoading: profilesLoading } =
    useLateProfiles();
  const { data: accountsData, isLoading: accountsLoading } =
    useLateAccounts(selectedProfileId);

  // Auto-select if only one profile
  const profiles = profilesData?.profiles || [];
  const autoSelectedProfileId = useMemo(() => {
    if (profiles.length === 1) return profiles[0]._id;
    return null;
  }, [profiles]);

  const effectiveProfileId = selectedProfileId || autoSelectedProfileId;

  // Group accounts by platform
  const groupedAccounts = useMemo(() => {
    const accounts = accountsData?.accounts || [];
    const groups: Record<string, LateAccount[]> = {};
    for (const account of accounts) {
      const platform = account.platform || 'unknown';
      if (!groups[platform]) groups[platform] = [];
      groups[platform].push(account);
    }
    return groups;
  }, [accountsData]);

  const handleConnectAccount = useCallback(
    async (account: LateAccount) => {
      if (connecting) return;
      setConnecting(true);

      try {
        const response = await fetch('/integrations/late/connect-account', {
          method: 'POST',
          body: JSON.stringify({
            lateProfileId: effectiveProfileId,
            accountId: account._id,
            platform: account.platform,
            username: account.username,
            displayName: account.displayName,
          }),
        });

        if (response.ok) {
          toaster.show(
            t('channel_added_successfully', 'Channel added successfully!'),
            'success'
          );
          onComplete();
        } else {
          const err = await response.json().catch(() => ({}));
          toaster.show(
            err.message ||
              t('failed_to_add_channel', 'Failed to add channel'),
            'warning'
          );
        }
      } catch {
        toaster.show(
          t('failed_to_add_channel', 'Failed to add channel'),
          'warning'
        );
      } finally {
        setConnecting(false);
      }
    },
    [effectiveProfileId, connecting]
  );

  const handleConnectNewAccount = useCallback(
    async (platform: string) => {
      if (!effectiveProfileId) return;

      try {
        const response = await fetch(
          `/integrations/late/new-account-url?platform=${platform}&lateProfileId=${effectiveProfileId}`
        );
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          toaster.show(
            t(
              'failed_to_get_connect_url',
              'Failed to get connection URL'
            ),
            'warning'
          );
        }
      } catch {
        toaster.show(
          t('failed_to_get_connect_url', 'Failed to get connection URL'),
          'warning'
        );
      }
    },
    [effectiveProfileId]
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
              'no_late_profiles_found',
              'No Late profiles found. Make sure your Late API key is configured in Settings.'
            )}
          </p>
        ) : (
          <>
            <p className="text-[14px] text-textColor/80">
              {t(
                'select_late_profile',
                'Select a Late profile to see connected accounts:'
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
                      Default
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

  // Step 2: Account selection
  return (
    <div className="flex flex-col gap-[16px] pt-[8px]">
      {profiles.length > 1 && (
        <button
          onClick={() => setSelectedProfileId(null)}
          className="flex items-center gap-[4px] text-[13px] text-textColor/60 hover:text-textColor cursor-pointer"
        >
          ← {t('back_to_profiles', 'Back to profiles')}
        </button>
      )}

      {accountsLoading ? (
        <div className="flex justify-center py-[20px]">
          <div className="w-[32px] h-[32px] border-[3px] border-buttonColor border-t-transparent rounded-full animate-spin" />
        </div>
      ) : Object.keys(groupedAccounts).length === 0 ? (
        <p className="text-[14px] text-textColor/60 text-center py-[20px]">
          {t(
            'no_late_accounts_found',
            'No connected accounts found in this profile.'
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-[16px] max-h-[400px] overflow-y-auto">
          {Object.entries(groupedAccounts).map(([platform, accounts]) => (
            <div key={platform} className="flex flex-col gap-[8px]">
              <div className="flex items-center gap-[8px] text-[13px] font-medium text-textColor/60 uppercase tracking-wide">
                <PlatformIcon platform={platform} size={18} />
                {PLATFORM_NAMES[platform] || platform}
              </div>
              {accounts.map((account) => (
                <button
                  key={account._id}
                  onClick={() => handleConnectAccount(account)}
                  disabled={connecting}
                  className="flex items-center gap-[12px] p-[12px] rounded-[8px] bg-newTableHeader hover:bg-tableBorder transition-colors cursor-pointer text-start disabled:opacity-50"
                >
                  <PlatformIcon platform={platform} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-textColor truncate">
                      {account.displayName || account.username}
                    </div>
                    {account.username &&
                      account.displayName &&
                      account.username !== account.displayName && (
                        <div className="text-[12px] text-textColor/50 truncate">
                          @{account.username}
                        </div>
                      )}
                  </div>
                  {account.isActive && (
                    <span className="text-[11px] px-[6px] py-[1px] rounded-full bg-green-500/20 text-green-500">
                      Active
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-tableBorder pt-[12px]">
        <ConnectNewAccountSection onConnect={handleConnectNewAccount} />
      </div>
    </div>
  );
};

const ConnectNewAccountSection: FC<{
  onConnect: (platform: string) => void;
}> = ({ onConnect }) => {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  const platforms = Object.entries(PLATFORM_NAMES);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full text-[13px] text-buttonColor hover:text-buttonColor/80 cursor-pointer text-center py-[4px]"
      >
        + {t('connect_new_account', 'Connect a new account via Late')}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <p className="text-[13px] text-textColor/60">
        {t('select_platform_to_connect', 'Select a platform to connect:')}
      </p>
      <div className="grid grid-cols-4 gap-[8px]">
        {platforms.map(([id, name]) => (
          <button
            key={id}
            onClick={() => onConnect(id)}
            className="flex flex-col items-center gap-[6px] p-[10px] rounded-[8px] bg-newTableHeader hover:bg-tableBorder transition-colors cursor-pointer"
          >
            <PlatformIcon platform={id} size={24} />
            <span className="text-[11px] text-textColor/80 text-center leading-tight">
              {name}
            </span>
          </button>
        ))}
      </div>
      <Button
        type="button"
        className="!bg-transparent !text-textColor/60 !text-[12px]"
        onClick={() => setExpanded(false)}
      >
        {t('cancel', 'Cancel')}
      </Button>
    </div>
  );
};
