'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';

export interface ProfilePersona {
  id?: string;
  profileId?: string;
  brandDescription?: string | null;
  toneOfVoice?: string | null;
  writingInstructions?: string | null;
  preferredCtas?: string[];
  contentRestrictions?: string | null;
  imageStyle?: string | null;
  targetAudience?: string | null;
  examplePosts?: string[];
}

export interface ProfileListItem {
  id: string;
  name: string;
  isDefault: boolean;
}

export const useProfilesList = () => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    const res = await fetch('/profiles', { method: 'GET' });
    return res.json();
  }, [fetch]);
  return useSWR<ProfileListItem[]>('profiles-list-persona', loader);
};

export const useProfilePersona = (profileId: string | null) => {
  const fetch = useFetch();
  const loader = useCallback(async () => {
    if (!profileId) return { persona: null };
    const res = await fetch(`/settings/profiles/${profileId}/persona`, {
      method: 'GET',
    });
    return res.json();
  }, [fetch, profileId]);
  return useSWR<{ persona: ProfilePersona | null }>(
    profileId ? `profile-persona-${profileId}` : null,
    loader
  );
};
