import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
export const dynamic = 'force-dynamic';
import { cookies } from 'next/headers';
import { Register } from '@gitroom/frontend/components/auth/register';
import { Metadata } from 'next';
import { isGeneralServerSide } from '@gitroom/helpers/utils/is.general.server.side';
import Link from 'next/link';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { LoginWithOidc } from '@gitroom/frontend/components/auth/login.with.oidc';
export const metadata: Metadata = {
  title: `${isGeneralServerSide() ? 'Robô MultiPost' : 'Gitroom'} Register`,
  description: '',
};
export default async function Auth(params: {searchParams: Promise<{provider: string}>}) {
  const t = await getT();
  if (process.env.DISABLE_REGISTRATION === 'true') {
    // Convite presente (cookie `org`, setado pelo proxy a partir do `?org=`)
    // libera o formulario de registro mesmo com o registro publico desativado.
    // A validade do convite (assinatura + expiracao do JWT) e reforcada pelo
    // backend em /auth/register; aqui e apenas UX.
    const hasInvite = !!(await cookies()).get('org')?.value;
    const canRegister =
      hasInvite ||
      (await (await internalFetch('/auth/can-register')).json()).register;
    if (!canRegister && !(await params?.searchParams)?.provider) {
      return (
        <div className="flex flex-col flex-1">
          <LoginWithOidc />
          <div className="text-center">
            {t('registration_is_disabled', 'Registration is disabled')}
            <br />
            <Link className="underline hover:font-bold" href="/auth/login">
              {t('login_instead', 'Login instead')}
            </Link>
          </div>
        </div>
      );
    }
  }
  return <Register />;
}
