'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  useProfilesList,
} from '@gitroom/frontend/components/settings/profile-persona.hooks';
import { ProfilePersonaSettingsSection } from '@gitroom/frontend/components/settings/profile-persona.settings.component';
import { KnowledgeBaseSettingsSection } from '@gitroom/frontend/components/settings/knowledge-base.settings.component';
import { AiCreditsSettingsSection } from '@gitroom/frontend/components/settings/ai-credits.settings.component';

const CollapsibleSection: React.FC<{
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, description, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-sixth border-fifth border rounded-[4px] overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-[20px] py-[14px] text-left hover:bg-newBgColorInner transition-colors"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div>
          <h4 className="text-[16px] text-textColor font-medium">{title}</h4>
          {description && (
            <p className="text-customColor18 text-[12px] mt-[2px]">{description}</p>
          )}
        </div>
        <span className="text-customColor18 text-[18px] select-none">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="px-[20px] pb-[20px] pt-[6px]">
          {children}
        </div>
      )}
    </div>
  );
};

export const AiAgentSettingsSection: React.FC = () => {
  const t = useT();
  const { data: profiles } = useProfilesList();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProfileId && profiles && profiles.length > 0) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  const profileOptions = useMemo(
    () =>
      (profiles || []).map((p) => ({
        id: p.id,
        name: p.isDefault ? `${p.name} (default)` : p.name,
      })),
    [profiles]
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('ai_agent_tab', 'AI Agent')}</h3>
      <div className="text-customColor18 mt-[4px] text-[13px]">
        {t(
          'ai_agent_description',
          'Configure how the AI agent generates content for each profile.'
        )}
      </div>

      <div className="my-[16px] flex flex-col gap-[6px] max-w-[380px]">
        <label className="text-[13px] text-textColor">
          {t('persona_select_profile', 'Profile')}
        </label>
        <select
          className="h-[36px] bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[13px] text-textColor px-[8px] outline-none"
          value={selectedProfileId ?? ''}
          onChange={(e) => setSelectedProfileId(e.target.value || null)}
        >
          {profileOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-[12px]">
        <CollapsibleSection
          title={t('ai_agent_section_persona', 'Persona')}
          description={t(
            'persona_description',
            'Define how the AI agent writes for each profile (tone, CTAs, image style, restrictions).'
          )}
        >
          <ProfilePersonaSettingsSection profileId={selectedProfileId} />
        </CollapsibleSection>

        <CollapsibleSection
          title={t('ai_agent_section_kb', 'Knowledge Base')}
          description={t(
            'kb_description',
            'Upload briefings, catalogs, and other documents. The AI agent can cite facts from them when generating posts.'
          )}
        >
          <KnowledgeBaseSettingsSection profileId={selectedProfileId} />
        </CollapsibleSection>

        <CollapsibleSection
          title={t('ai_agent_section_credits', 'Credits')}
          description={t(
            'ai_agent_credits_description',
            'Manage AI image and video generation credits per profile.'
          )}
          defaultOpen={false}
        >
          <AiCreditsSettingsSection />
        </CollapsibleSection>
      </div>
    </div>
  );
};

export default AiAgentSettingsSection;
