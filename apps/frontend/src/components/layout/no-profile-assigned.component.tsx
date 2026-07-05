'use client';

import React, { FC, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Tela bloqueante para org USER sem nenhuma membership de perfil
// (closed-by-default). O backend nega dados escopados com 403
// NO_PROFILE_ASSIGNED; aqui o usuario ve o estado e pode sair da conta.
export const NoProfileAssignedComponent: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const logout = useCallback(async () => {
    await fetch('/user/logout', { method: 'POST' });
    window.location.href = '/';
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-[16px] text-newTextColor p-[24px] text-center">
      <div className="text-[24px] font-[600]">
        {t('no_profile_assigned_title', 'Waiting for profile assignment')}
      </div>
      <div className="max-w-[480px] text-textItemBlur">
        {t(
          'no_profile_assigned_description',
          'Your account has not been assigned to any profile in this workspace yet. Ask an administrator to add you to a profile in Settings → Profiles.'
        )}
      </div>
      <Button onClick={logout}>
        {t('no_profile_assigned_logout', 'Log out')}
      </Button>
    </div>
  );
};
