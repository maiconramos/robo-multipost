'use client';

import { useT } from '@gitroom/react/translation/get.transation.service.client';

export default function LoginRequiredPage() {
  const t = useT();
  return (
    <div className="fixed left-0 top-0 w-full h-full bg-[#121212] z-[100] flex justify-center items-center text-4xl">
      {t('login_to_use_wizard', 'Login to use the wizard to generate API code')}
    </div>
  );
}
