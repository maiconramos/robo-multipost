'use client';

import { useMemo } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

// Permissoes de UI derivadas do papel no perfil ativo. Admin/superadmin da org
// tem profileRole 'OWNER' implicito (setado pelo backend), entao passa em tudo.
// O backend continua sendo a fonte de verdade (ProfileAccessGuard); isto e
// apenas para esconder/desabilitar acoes na interface.
export const useProfilePermissions = () => {
  const user = useUser();
  return useMemo(() => {
    const role = user?.profileRole ?? null;
    const isViewer = role === 'VIEWER';
    const isManager = role === 'OWNER' || role === 'MANAGER';
    return {
      role,
      // VIEWER so le; qualquer outro papel (EDITOR/MANAGER/OWNER) escreve.
      canWrite: !!role && !isViewer,
      // OWNER/MANAGER gerenciam o perfil (membros, persona, base de conhecimento).
      canManageProfile: isManager,
      isViewer,
    };
  }, [user?.profileRole]);
};
