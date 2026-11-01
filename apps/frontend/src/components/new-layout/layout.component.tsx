'use client';

import { setUserTimezone } from '@gitroom/helpers/utils/user.timezone';
import React, { ReactNode, useCallback, useState } from 'react';
import { ResponsiveDrawer } from '@gitroom/frontend/components/ui/responsive.drawer';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { jakartaSans } from '@gitroom/frontend/fonts/plus-jakarta-sans/plus.jakarta.sans.font';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { usePathname, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotProvider } from '@gitroom/frontend/components/layout/copilot.provider';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Impersonate } from '@gitroom/frontend/components/layout/impersonate';
import { AnnouncementBanner } from '@gitroom/frontend/components/layout/announcement.banner';
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { ProfileSelector } from '@gitroom/frontend/components/layout/profile.selector';
import { StreakComponent } from '@gitroom/frontend/components/layout/streak.component';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
import { NoProfileAssignedComponent } from '@gitroom/frontend/components/layout/no-profile-assigned.component';
import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';
import { FirstBillingComponent } from '@gitroom/frontend/components/billing/first.billing.component';

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();
  const t = useT();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    onSuccess: (data) => setUserTimezone(data?.timezoneName),
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  if (!user) return null;
  // SWR cache hits also initialize before any child renders a date.
  if (typeof window !== 'undefined') setUserTimezone(user.timezoneName);

  // Closed-by-default: org USER sem perfil atribuido nao carrega o app —
  // ve o estado "aguardando atribuicao" ate um admin conceder um perfil.
  if (user.role === 'USER' && !user.profileId) {
    return <NoProfileAssignedComponent />;
  }

  return (
    <ContextWrapper user={user}>
      <CopilotProvider runtimeUrl={backendUrl + '/copilot/chat'}>
        <MantineWrapper>
          <ToolTip />
          <Toaster />
          <CheckPayment check={searchParams.get('check') || ''} mutate={mutate}>
            <ShowMediaBoxModal />
            <ShowLinkedinCompany />
            <MediaSettingsLayout />
            <ShowPostSelector />
            <PreConditionComponent />
            <NewSubscription />
            <ContinueProvider />
            <div
              className={clsx(
                'flex flex-col min-h-screen w-full min-w-0 text-newTextColor p-[12px] mobile:p-[8px]',
                jakartaSans.className
              )}
            >
              <div>{user?.admin ? <Impersonate /> : <div />}</div>
              {user.tier === 'FREE' && isGeneral && billingEnabled ? (
                <FirstBillingComponent />
              ) : (
                <>
                  <AnnouncementBanner />
                  <div className="flex-1 min-w-0 flex gap-[8px] mobile:gap-0">
                    <Support />
                    <div className="flex flex-col bg-newBgColorInner w-[96px] shrink-0 rounded-[12px] mobile:hidden">
                      <div
                        id="left-menu"
                        className={clsx(
                          'fixed h-full w-[64px] start-[17px] flex flex-1 top-0',
                          user?.admin && 'pt-[60px] max-h-[1000px]:w-[500px]'
                        )}
                      >
                        <div className="flex flex-col h-full gap-[32px] flex-1 py-[12px]">
                          <Logo />
                          <TopMenu />
                        </div>
                      </div>
                    </div>
                    <ResponsiveDrawer
                      open={menuOpen}
                      onClose={() => setMenuOpen(false)}
                      title={t('navigation', 'Navigation')}
                      routeKey={pathname}
                    >
                      <div
                        onClick={() => setMenuOpen(false)}
                        className="mobile-navigation"
                      >
                        <TopMenu />
                      </div>
                      <div className="flex flex-wrap items-center gap-[16px] border-t border-newBorder pt-[16px]">
                        <OrganizationSelector />
                        <LanguageComponent />
                        <ModeComponent />
                      </div>
                    </ResponsiveDrawer>
                    <div className="flex-1 min-w-0 bg-newBgLineColor rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                      <div className="relative flex bg-newBgColorInner h-[80px] mobile:h-[64px] shrink-0 px-[20px] mobile:px-[12px] gap-[12px] items-center">
                        <button
                          type="button"
                          onClick={() => setMenuOpen(true)}
                          aria-label={t('open_menu', 'Open menu')}
                          aria-expanded={menuOpen}
                          className="hidden mobile:flex items-center justify-center h-[44px] w-[44px] shrink-0 bg-btnSimple rounded-[8px] text-btnText"
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M3 6H21M3 12H21M3 18H21"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                        <div className="text-[24px] mobile:text-[18px] font-[600] flex-1 min-w-0">
                          <Title />
                        </div>
                        <div className="flex gap-[20px] mobile:gap-[10px] items-center min-w-0 text-textItemBlur">
                          <div className="contents mobile:hidden">
                            <StreakComponent />
                            <div className="w-[1px] h-[20px] bg-blockSeparator" />
                            <OrganizationSelector />
                          </div>
                          <ProfileSelector />
                          <div className="contents mobile:hidden">
                            <div className="hover:text-newTextColor">
                              {!menuOpen && <ModeComponent />}
                            </div>
                            <div className="w-[1px] h-[20px] bg-blockSeparator" />
                            <LanguageComponent />
                            <ChromeExtensionComponent />
                            <div className="w-[1px] h-[20px] bg-blockSeparator" />
                            <AttachToFeedbackIcon />
                          </div>
                          <NotificationComponent />
                        </div>
                      </div>
                      <div className="flex flex-1 min-w-0 gap-[1px] mobile:flex-col">
                        {children}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CheckPayment>
        </MantineWrapper>
      </CopilotProvider>
    </ContextWrapper>
  );
};
