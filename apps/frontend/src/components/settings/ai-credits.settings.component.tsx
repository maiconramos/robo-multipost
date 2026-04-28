'use client';

import React, { useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';

interface ProfileSummary {
  id: string;
  name: string;
  isDefault: boolean;
  aiImageCredits: number | null;
  aiVideoCredits: number | null;
  usedImages: number;
  usedVideos: number;
}

interface CreditsSummary {
  profiles: ProfileSummary[];
  mode: string;
}

const CreditCell: React.FC<{
  credits: number | null;
  used: number;
  isDefault: boolean;
  t: (key: string, fallback: string) => string;
}> = ({ credits, used, isDefault, t }) => {
  if (isDefault) {
    return (
      <span className="text-customColor18">
        {t('ai_credits_unlimited', 'Unlimited')}
      </span>
    );
  }

  if (credits === null || credits === undefined) {
    return (
      <span className="text-customColor18">
        {t('ai_credits_default_profile', 'Default')}
      </span>
    );
  }

  if (credits === -1 || credits >= 999999) {
    return (
      <span className="text-customColor18">
        {t('ai_credits_unlimited', 'Unlimited')}
      </span>
    );
  }

  if (credits === 0) {
    return (
      <span className="text-customColor19 font-semibold">
        {t('ai_credits_blocked', 'Blocked')}
      </span>
    );
  }

  const percentage = credits > 0 ? (used / credits) * 100 : 0;
  const colorClass =
    percentage >= 100
      ? 'text-customColor19'
      : percentage >= 80
      ? 'text-customColor13'
      : 'text-customColor42';

  return (
    <span className={colorClass}>
      {t('ai_credits_used', '{{used}} of {{total}} used')
        .replace('{{used}}', String(used))
        .replace('{{total}}', String(credits))}
    </span>
  );
};

const EditRow: React.FC<{
  profile: ProfileSummary;
  onSave: (id: string, imageCredits: number | null, videoCredits: number | null) => Promise<void>;
  onCancel: () => void;
  t: (key: string, fallback: string) => string;
}> = ({ profile, onSave, onCancel, t }) => {
  const [imageInput, setImageInput] = useState(
    profile.aiImageCredits === null ? '' : String(profile.aiImageCredits)
  );
  const [videoInput, setVideoInput] = useState(
    profile.aiVideoCredits === null ? '' : String(profile.aiVideoCredits)
  );
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const imgVal = imageInput.trim() === '' ? null : Number(imageInput);
    const vidVal = videoInput.trim() === '' ? null : Number(videoInput);
    try {
      await onSave(profile.id, imgVal, vidVal);
    } finally {
      setSaving(false);
    }
  }, [imageInput, videoInput, profile.id, onSave]);

  return (
    <tr className="border-t border-tableBorder">
      <td className="px-[12px] py-[10px] text-[13px]">{profile.name}</td>
      <td className="px-[12px] py-[10px]">
        <input
          type="number"
          className="h-[32px] w-[100px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[8px] outline-none"
          placeholder={t('ai_credits_default_profile', 'Default')}
          value={imageInput}
          onChange={(e) => setImageInput(e.target.value)}
        />
      </td>
      <td className="px-[12px] py-[10px]">
        <input
          type="number"
          className="h-[32px] w-[100px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[8px] outline-none"
          placeholder={t('ai_credits_default_profile', 'Default')}
          value={videoInput}
          onChange={(e) => setVideoInput(e.target.value)}
        />
      </td>
      <td className="px-[12px] py-[10px]">
        <div className="flex gap-[6px]">
          <Button onClick={handleSave} loading={saving}>
            {t('ai_credits_save', 'Save')}
          </Button>
          <Button onClick={onCancel} secondary>
            {t('ai_credits_cancel', 'Cancel')}
          </Button>
        </div>
      </td>
    </tr>
  );
};

export const AiCreditsSettingsSection: React.FC = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    return (await fetch('/settings/ai-credits/summary', { method: 'GET' })).json();
  }, []);

  const { data, isLoading, mutate } = useSWR<CreditsSummary>(
    'ai-credits-summary',
    loadSummary
  );

  const handleSave = useCallback(
    async (profileId: string, imageCredits: number | null, videoCredits: number | null) => {
      try {
        const res = await fetch(`/settings/profiles/${profileId}/ai-credits`, {
          method: 'PUT',
          body: JSON.stringify({
            aiImageCredits: imageCredits,
            aiVideoCredits: videoCredits,
          }),
        });
        if (res.ok) {
          await mutate();
          setEditingId(null);
          toaster.show(t('ai_credits_save', 'Save'), 'success');
        } else {
          const err = await res.json().catch(() => ({}));
          toaster.show(err.message || 'Error', 'warning');
        }
      } catch {
        toaster.show('Error', 'warning');
      }
    },
    [fetch, mutate, toaster, t]
  );

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">...</div>
      </div>
    );
  }

  if (!data || data.mode !== 'managed') {
    return (
      <div className="flex flex-col">
        <h3 className="text-[20px]">{t('ai_credits_title', 'AI Credits')}</h3>
        <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
          <div className="text-customColor18 text-[14px]">
            {t('ai_credits_unlimited_mode_info', 'Unlimited mode is active. All profiles have unlimited AI credits. To manage credits per profile, set AI_CREDITS_MODE=managed.')}
          </div>
        </div>
      </div>
    );
  }

  const nonDefaultProfiles = data.profiles.filter((p) => !p.isDefault);

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('ai_credits_title', 'AI Credits')}</h3>
      <div className="text-customColor18 mt-[4px]">
        {t('ai_credits_per_month', 'per month')}
      </div>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-newTableHeader text-customColor18 text-left">
              <th className="px-[12px] py-[10px] font-medium">
                {t('ai_credits_profile', 'Profile')}
              </th>
              <th className="px-[12px] py-[10px] font-medium">
                {t('ai_credits_image_credits', 'Image Credits')}
              </th>
              <th className="px-[12px] py-[10px] font-medium">
                {t('ai_credits_video_credits', 'Video Credits')}
              </th>
              <th className="px-[12px] py-[10px] font-medium">
                {t('ai_credits_actions', 'Actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {nonDefaultProfiles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-[12px] py-[20px] text-center text-customColor18">
                  {t('ai_credits_not_configured', 'AI generation is not available. Contact your administrator.')}
                </td>
              </tr>
            )}
            {nonDefaultProfiles.map((profile) =>
              editingId === profile.id ? (
                <EditRow
                  key={profile.id}
                  profile={profile}
                  onSave={handleSave}
                  onCancel={() => setEditingId(null)}
                  t={t}
                />
              ) : (
                <tr key={profile.id} className="border-t border-tableBorder">
                  <td className="px-[12px] py-[10px]">{profile.name}</td>
                  <td className="px-[12px] py-[10px]">
                    <CreditCell
                      credits={profile.aiImageCredits}
                      used={profile.usedImages}
                      isDefault={profile.isDefault}
                      t={t}
                    />
                  </td>
                  <td className="px-[12px] py-[10px]">
                    <CreditCell
                      credits={profile.aiVideoCredits}
                      used={profile.usedVideos}
                      isDefault={profile.isDefault}
                      t={t}
                    />
                  </td>
                  <td className="px-[12px] py-[10px]">
                    <Button
                      onClick={() => setEditingId(profile.id)}
                      secondary
                    >
                      {t('ai_credits_edit', 'Edit credits')}
                    </Button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AiCreditsSettingsSection;
