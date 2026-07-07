'use client';

import { FC, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { OnboardingModal } from '@gitroom/frontend/components/onboarding/onboarding.modal';
import { useProfilePermissions } from '@gitroom/frontend/hooks/use-profile-permissions';

export const Onboarding: FC = () => {
  const query = useSearchParams();
  const modal = useModals();
  const router = useRouter();
  const modalOpen = useRef(false);
  const t = useT();
  // Membro restrito (ex.: Visualizador convidado por uma agencia) nao conecta
  // canais — o onboarding de "conectar Instagram/Facebook" nao se aplica.
  const { canWrite } = useProfilePermissions();

  const handleClose = useCallback(() => {
    modal.closeAll();
    router.push('/launches');
  }, [modal, router]);

  useEffect(() => {
    const onboarding = query.get('onboarding');
    if (!onboarding || !canWrite) {
      if (modalOpen.current) {
        modalOpen.current = false;
        modal.closeAll();
      }
      return;
    }
    if (modalOpen.current) {
      return;
    }
    modalOpen.current = true;
    modal.openModal({
      // title: t('onboarding', 'Welcome to Postiz'),
      withCloseButton: true,
      closeOnEscape: false,
      removeLayout: true,
      askClose: true,
      fullScreen: true,
      onClose: handleClose,
      children: <OnboardingModal onClose={handleClose} />,
    });
  }, [query, handleClose, t]);
  
  return null;
};
