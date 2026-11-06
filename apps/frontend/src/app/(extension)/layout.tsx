import { cookies } from 'next/headers';
import { resolveBackendUrl } from '@gitroom/frontend/utils/backend-url';
import { resolveTheme } from '@gitroom/helpers/utils/theme';
import { ThemeProvider } from '@gitroom/react/helpers/theme';
export const dynamic = 'force-dynamic';
import '../global.scss';
import 'react-tooltip/dist/react-tooltip.css';
import '@copilotkit/react-ui/styles.css';
import LayoutContext from '@gitroom/frontend/components/layout/layout.context';
import { ReactNode } from 'react';
import { jakartaSans } from '@gitroom/frontend/fonts/plus-jakarta-sans/plus.jakarta.sans.font';
import clsx from 'clsx';
import { VariableContextComponent } from '@gitroom/react/helpers/variable.context';
import UtmSaver from '@gitroom/helpers/utils/utm.saver';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const theme = resolveTheme(cookieStore.get('mode')?.value);
  return (
    <html>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        className={clsx(
          jakartaSans.className,
          theme,
          'text-primary !bg-primary'
        )}
      >
        <ThemeProvider initialTheme={theme}>
          <VariableContextComponent
            language="en"
            storageProvider={
              process.env.STORAGE_PROVIDER! as 'local' | 'cloudflare'
            }
            stripeClient=""
            environment={process.env.NODE_ENV!}
            backendUrl={resolveBackendUrl(process.env.NEXT_PUBLIC_BACKEND_URL, process.env.NODE_ENV === 'production')}
            plontoKey={process.env.NEXT_PUBLIC_POLOTNO!}
            billingEnabled={!!process.env.STRIPE_PUBLISHABLE_KEY}
            discordUrl={process.env.NEXT_PUBLIC_DISCORD_SUPPORT!}
            frontEndUrl={process.env.FRONTEND_URL!}
            isGeneral={!!process.env.IS_GENERAL}
            genericOauth={!!process.env.POSTIZ_GENERIC_OAUTH}
            oauthLogoUrl={process.env.NEXT_PUBLIC_POSTIZ_OAUTH_LOGO_URL!}
            oauthDisplayName={
              process.env.NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME!
            }
            uploadDirectory={process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY!}
            cloudflareUrl={process.env.CLOUDFLARE_BUCKET_URL || ''}
            mainUrl={process.env.MAIN_URL || ''}
            mcpUrl={process.env.MCP_URL}
            dub={false}
            facebookPixel={process.env.NEXT_PUBLIC_FACEBOOK_PIXEL!}
            telegramBotName={process.env.TELEGRAM_BOT_NAME!}
            neynarClientId={process.env.NEYNAR_CLIENT_ID!}
            isSecured={!process.env.NOT_SECURED}
            disableImageCompression={!!process.env.DISABLE_IMAGE_COMPRESSION}
            disableXAnalytics={!!process.env.DISABLE_X_ANALYTICS}
            sentryDsn={process.env.NEXT_PUBLIC_SENTRY_DSN!}
            extensionId={process.env.EXTENSION_ID || ''}
            transloadit={
              process.env.TRANSLOADIT_AUTH && process.env.TRANSLOADIT_TEMPLATE
                ? [
                    process.env.TRANSLOADIT_AUTH!,
                    process.env.TRANSLOADIT_TEMPLATE!,
                  ]
                : []
            }
          >
            <LayoutContext>
              <UtmSaver />
              {children}
            </LayoutContext>
          </VariableContextComponent>
        </ThemeProvider>
      </body>
    </html>
  );
}
