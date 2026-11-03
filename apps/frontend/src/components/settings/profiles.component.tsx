'use client';

import { Button } from '@gitroom/react/form/button';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import React, { useCallback, useMemo, useState } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface Profile {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  members: Array<{ userId: string; role: string }>;
  _count: { integrations: number };
}

interface ProfileMember {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

const profileRoles = [
  { name: 'Owner', value: 'OWNER' },
  { name: 'Manager', value: 'MANAGER' },
  { name: 'Editor', value: 'EDITOR' },
  { name: 'Viewer', value: 'VIEWER' },
];

const CreateEditProfileModal: React.FC<{
  profile?: Profile;
  onSaved: () => void;
}> = ({ profile, onSaved }) => {
  const t = useT();
  const fetch = useFetch();
  const modals = useModals();
  const toast = useToaster();
  const [name, setName] = useState(profile?.name || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      setSaving(true);
      try {
        if (profile) {
          await fetch(`/profiles/${profile.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
          });
          toast.show(t('profiles_updated', 'Perfil atualizado'));
        } else {
          await fetch('/profiles', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined }),
          });
          toast.show(t('profiles_created', 'Perfil criado'));
        }
        onSaved();
        modals.closeAll();
      } catch {
        toast.show(t('profiles_save_error', 'Erro ao salvar perfil'), 'warning');
      } finally {
        setSaving(false);
      }
    },
    [name, description, profile]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[12px] p-[16px] pt-0">
      <div className="flex flex-col gap-[4px]">
        <label className="text-[14px]">{t('profiles_name', 'Nome')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('profiles_name_placeholder', 'Nome do perfil')}
          className="bg-input border border-tableBorder rounded-[4px] px-[12px] py-[8px] text-[14px] outline-none"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-[4px]">
        <label className="text-[14px]">{t('profiles_description', 'Descrição')}</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('profiles_description_placeholder', 'Descrição (opcional)')}
          className="bg-input border border-tableBorder rounded-[4px] px-[12px] py-[8px] text-[14px] outline-none"
        />
      </div>
      <Button type="submit" disabled={saving || !name.trim()}>
        {saving
          ? t('profiles_saving', 'Salvando...')
          : profile
          ? t('profiles_update', 'Atualizar')
          : t('profiles_create', 'Criar perfil')}
      </Button>
    </form>
  );
};

const ManageMembersModal: React.FC<{
  profileId: string;
  profileName: string;
}> = ({ profileId, profileName }) => {
  const t = useT();
  const fetch = useFetch();
  const toast = useToaster();

  const loadMembers = useCallback(async () => {
    return (await (await fetch(`/profiles/${profileId}/members`)).json()) as ProfileMember[];
  }, [profileId]);

  const { data: members, mutate } = useSWR(
    `profile-members-${profileId}`,
    loadMembers,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  );

  const loadTeam = useCallback(async () => {
    return (await (await fetch('/settings/team')).json()).users as Array<{
      id: string;
      role: string;
      user: { email: string; id: string };
    }>;
  }, []);

  const { data: teamMembers } = useSWR('team-for-profiles', loadTeam, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('EDITOR');

  const availableUsers = useMemo(() => {
    if (!teamMembers || !members) return [];
    const memberIds = members.map((m) => m.userId);
    return teamMembers.filter((t) => !memberIds.includes(t.user.id));
  }, [teamMembers, members]);

  const addMember = useCallback(async () => {
    if (!selectedUserId) return;
    await fetch(`/profiles/${profileId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
    });
    toast.show(t('profiles_member_added', 'Membro adicionado'));
    setSelectedUserId('');
    await mutate();
  }, [selectedUserId, selectedRole, profileId]);

  const removeMember = useCallback(
    (userId: string) => async () => {
      if (!(await deleteDialog(t('profiles_member_remove_confirm', 'Tem certeza que deseja remover este membro do perfil?')))) {
        return;
      }
      await fetch(`/profiles/${profileId}/members/${userId}`, {
        method: 'DELETE',
      });
      toast.show(t('profiles_member_removed', 'Membro removido'));
      await mutate();
    },
    [profileId]
  );

  return (
    <div className="flex flex-col gap-[16px] p-[16px] pt-0">
      <h4 className="text-[16px] font-[600]">
        {t('profiles_members_of', 'Membros de {{name}}', { name: profileName })}
      </h4>
      <div className="flex flex-col gap-[8px]">
        {(members || []).map((m) => (
          <div key={m.userId} className="flex items-center gap-[12px]">
            <div className="flex-1 text-[14px]">
              {m.user.name || m.user.email}
            </div>
            <div className="text-[12px] text-textItemBlur">
              {t(`profile_role_${String(m.role).toLowerCase()}`, m.role)}
            </div>
            <Button
              className="!bg-customColor3 !h-[24px] border border-customColor21 rounded-[4px] text-[12px]"
              onClick={removeMember(m.userId)}
              secondary={true}
            >
              {t('profiles_remove', 'Remover')}
            </Button>
          </div>
        ))}
        {(!members || members.length === 0) && (
          <div className="text-[14px] text-textItemBlur">
            {t('profiles_no_members', 'Nenhum membro')}
          </div>
        )}
      </div>
      {availableUsers.length > 0 && (
        <div className="flex gap-[8px] items-end">
          <div className="flex flex-col gap-[4px] flex-1">
            <label className="text-[12px]">{t('profiles_user', 'Usuário')}</label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-input border border-tableBorder rounded-[4px] px-[12px] py-[8px] text-[14px] outline-none"
            >
              <option value="">{t('profiles_select', 'Selecione...')}</option>
              {availableUsers.map((u) => (
                <option key={u.user.id} value={u.user.id}>
                  {u.user.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-[4px]">
            <label className="text-[12px]">{t('profiles_role', 'Papel')}</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-input border border-tableBorder rounded-[4px] px-[12px] py-[8px] text-[14px] outline-none"
            >
              {profileRoles.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(`profile_role_${r.value.toLowerCase()}`, r.name)}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={addMember} disabled={!selectedUserId}>
            {t('profiles_add', 'Adicionar')}
          </Button>
        </div>
      )}
    </div>
  );
};

export const ProfilesSettingsComponent = () => {
  const t = useT();
  const fetch = useFetch();
  const user = useUser();
  const modals = useModals();
  const toast = useToaster();

  const loadProfiles = useCallback(async () => {
    return (await (await fetch('/profiles')).json()) as Profile[];
  }, []);

  const { data, mutate } = useSWR('/api/profiles', loadProfiles, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });

  const openCreateModal = useCallback(() => {
    modals.openModal({
      classNames: {
        modal: 'bg-transparent text-textColor',
      },
      title: t('profiles_create', 'Criar perfil'),
      withCloseButton: true,
      children: <CreateEditProfileModal onSaved={() => mutate()} />,
    });
  }, [mutate]);

  const openEditModal = useCallback(
    (profile: Profile) => () => {
      modals.openModal({
        classNames: {
          modal: 'bg-transparent text-textColor',
        },
        title: t('profiles_edit_title', 'Editar perfil'),
        withCloseButton: true,
        children: (
          <CreateEditProfileModal profile={profile} onSaved={() => mutate()} />
        ),
      });
    },
    [mutate]
  );

  const openMembersModal = useCallback(
    (profile: Profile) => () => {
      modals.openModal({
        classNames: {
          modal: 'bg-transparent text-textColor',
        },
        title: t('profiles_members_title', 'Membros - {{name}}', { name: profile.name }),
        withCloseButton: true,
        size: 'lg',
        children: (
          <ManageMembersModal profileId={profile.id} profileName={profile.name} />
        ),
      });
    },
    []
  );

  const deleteProfile = useCallback(
    (profile: Profile) => async () => {
      if (profile.isDefault) {
        toast.show(
          t('profiles_cannot_delete_default', 'Não é possível excluir o perfil padrão'),
          'warning'
        );
        return;
      }
      if (
        !(await deleteDialog(
          t(
            'profiles_delete_confirm',
            'Tem certeza que deseja excluir este perfil? Canais e automações serão desativados, e posts agendados ou em rascunho serão removidos. O histórico publicado será preservado.'
          )
        ))
      ) {
        return;
      }
      try {
        const res = await fetch(`/profiles/${profile.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const body = await res.json();
          toast.show(
            body.message || t('profiles_delete_error', 'Erro ao excluir perfil'),
            'warning'
          );
          return;
        }
        toast.show(t('profiles_deleted', 'Perfil excluído'));
        await mutate();
      } catch {
        toast.show(t('profiles_delete_error', 'Erro ao excluir perfil'), 'warning');
      }
    },
    [mutate]
  );

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">{t('profiles_title', 'Perfis')}</h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'profiles_subtitle',
          'Gerencie os perfis da sua organização. Cada perfil agrupa canais e conteúdo separados.'
        )}
      </div>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
        <div className="flex flex-col gap-[16px]">
          {(data || []).map((profile) => (
            <div key={profile.id} className="flex items-center gap-[12px]">
              <div className="flex-1">
                <span className="font-[600]">{profile.name}</span>
                {profile.isDefault && (
                  <span className="ml-[8px] text-[11px] bg-btnPrimary text-white px-[6px] py-[2px] rounded-[4px]">
                    {t('profiles_default_badge', 'Padrão')}
                  </span>
                )}
              </div>
              <div className="text-[12px] text-textItemBlur">
                {profile._count.integrations === 1
                  ? t('profiles_channel_count_one', '1 canal')
                  : t('profiles_channels_count', '{{count}} canais', {
                      count: profile._count.integrations,
                    })}
              </div>
              <div className="text-[12px] text-textItemBlur">
                {profile.members.length === 1
                  ? t('profiles_member_count_one', '1 membro')
                  : t('profiles_members_count', '{{count}} membros', {
                      count: profile.members.length,
                    })}
              </div>
              <div className="flex gap-[8px]">
                <Button
                  className="!bg-customColor3 !h-[24px] border border-customColor21 rounded-[4px] text-[12px]"
                  onClick={openMembersModal(profile)}
                  secondary={true}
                >
                  {t('profiles_members', 'Membros')}
                </Button>
                {isAdmin && (
                  <Button
                    className="!bg-customColor3 !h-[24px] border border-customColor21 rounded-[4px] text-[12px]"
                    onClick={openEditModal(profile)}
                    secondary={true}
                  >
                    {t('profiles_edit', 'Editar')}
                  </Button>
                )}
                {isAdmin && !profile.isDefault && (
                  <Button
                    className="!bg-customColor3 !h-[24px] border border-customColor21 rounded-[4px] text-[12px]"
                    onClick={deleteProfile(profile)}
                    secondary={true}
                  >
                    {t('profiles_delete', 'Excluir')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        {isAdmin && (
          <div>
            <Button onClick={openCreateModal}>
              {t('profiles_create_new', 'Criar novo perfil')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
