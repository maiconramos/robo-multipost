import { ExtensionRequest, GetCookiesResponse, ProviderInfo, StoredRefreshEntry } from './types/messages';
import { getAllProviders, getProvider } from './providers/provider.registry';
import { CookieProvider } from './providers/cookie-provider.interface';

const EXTENSION_VERSION = '2.0.0';
const REFRESH_ALARM_NAME = 'cookie-refresh';
const STORAGE_KEY = 'refreshEntries';

// localhost so no build de desenvolvimento: no build publicado qualquer
// processo/pagina em qualquer porta local pedia os cookies do Skool.
const ALLOWED_ORIGIN_PATTERNS = [
  ...(import.meta.env.DEV ? [/^https?:\/\/localhost(:\d+)?$/] : []),
  /^https:\/\/([a-z0-9-]+\.)*postiz\.com$/,
];

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

// O refresh diario envia os cookies para `backendUrl`: so aceita um backend
// que tambem esteja no allowlist (nunca um endereco escolhido pela pagina).
function isBackendUrlAllowed(backendUrl: unknown): backendUrl is string {
  if (typeof backendUrl !== 'string') return false;
  try {
    return isOriginAllowed(new URL(backendUrl).origin);
  } catch {
    return false;
  }
}

async function extractCookies(provider: CookieProvider): Promise<GetCookiesResponse> {
  const allCookies = await chrome.cookies.getAll({ url: provider.url });

  const extracted: Record<string, string> = {};
  const missingRequired: string[] = [];

  for (const def of provider.cookies) {
    const found = allCookies.find((c) => c.name === def.name);
    if (found) {
      extracted[def.name] = found.value;
    } else if (def.required) {
      missingRequired.push(def.name);
    }
  }

  if (missingRequired.length > 0) {
    return {
      success: false,
      provider: provider.identifier,
      error: `Missing required cookies: ${missingRequired.join(', ')}. User may need to log in to ${provider.name}.`,
      missingCookies: missingRequired,
    };
  }

  return {
    success: true,
    provider: provider.identifier,
    cookies: extracted,
  };
}

// --- Refresh Token Storage Helpers ---

async function getStoredEntries(): Promise<Record<string, StoredRefreshEntry>> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {};
}

async function setStoredEntries(entries: Record<string, StoredRefreshEntry>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: entries });
}

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(REFRESH_ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: 1440 });
  }
}

async function clearAlarmIfEmpty(): Promise<void> {
  const entries = await getStoredEntries();
  if (Object.keys(entries).length === 0) {
    await chrome.alarms.clear(REFRESH_ALARM_NAME);
  }
}

// --- Background Cookie Refresh ---

async function refreshAllCookies(): Promise<void> {
  const entries = await getStoredEntries();
  for (const [integrationId, entry] of Object.entries(entries)) {
    try {
      // entradas antigas gravadas antes da validacao: nao envia para backend
      // fora do allowlist
      if (!isBackendUrlAllowed(entry.backendUrl)) continue;
      const provider = getProvider(entry.provider);
      if (!provider) continue;

      const cookieResult = await extractCookies(provider);
      if (!cookieResult.success) continue;

      const base64Cookies = btoa(JSON.stringify(cookieResult.cookies));

      await fetch(`${entry.backendUrl}/integrations/extension-refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt: entry.jwt, cookies: base64Cookies }),
      });
    } catch {
      // Silently skip — will retry next cycle
    }
  }
}

// --- Alarm Listener ---

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM_NAME) {
    refreshAllCookies();
  }
});

// --- Ensure alarm on startup ---

(async () => {
  const entries = await getStoredEntries();
  if (Object.keys(entries).length > 0) {
    await ensureAlarm();
  }
})();

// --- Message Listener ---

chrome.runtime.onMessageExternal.addListener(
  (
    message: ExtensionRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    const origin = sender.origin ?? sender.url;
    if (!isOriginAllowed(origin)) {
      sendResponse({ error: 'Unauthorized origin' });
      return true;
    }

    switch (message.type) {
      case 'PING': {
        sendResponse({ status: 'ok', version: EXTENSION_VERSION });
        break;
      }

      case 'GET_PROVIDERS': {
        const providers = getAllProviders();
        const providerInfos: ProviderInfo[] = providers.map((p) => ({
          identifier: p.identifier,
          name: p.name,
          url: p.url,
          cookieNames: p.cookies.map((c) => c.name),
        }));
        sendResponse({ providers: providerInfos });
        break;
      }

      case 'GET_COOKIES': {
        const provider = getProvider(message.provider);
        if (!provider) {
          sendResponse({
            success: false,
            provider: message.provider,
            error: `Unknown provider: ${message.provider}`,
          });
          break;
        }

        extractCookies(provider)
          .then((result) => sendResponse(result))
          .catch((err) =>
            sendResponse({
              success: false,
              provider: message.provider,
              error: `Failed to extract cookies: ${err.message}`,
            })
          );

        return true;
      }

      case 'STORE_REFRESH_TOKEN': {
        if (
          typeof message.integrationId !== 'string' ||
          typeof message.jwt !== 'string' ||
          !isBackendUrlAllowed(message.backendUrl)
        ) {
          sendResponse({ success: false, error: 'Invalid refresh entry' });
          return true;
        }
        (async () => {
          const entries = await getStoredEntries();
          const existing = entries[message.integrationId];
          if (existing?.origin && existing.origin !== origin) {
            sendResponse({ success: false, error: 'Entry owned by another origin' });
            return;
          }
          entries[message.integrationId] = {
            jwt: message.jwt,
            backendUrl: message.backendUrl,
            provider: message.provider,
            origin,
          };
          await setStoredEntries(entries);
          await ensureAlarm();
          sendResponse({ success: true });
        })().catch(() => sendResponse({ success: false }));

        return true;
      }

      case 'REMOVE_REFRESH_TOKEN': {
        (async () => {
          const entries = await getStoredEntries();
          const existing = entries[message.integrationId];
          if (existing?.origin && existing.origin !== origin) {
            sendResponse({ success: false, error: 'Entry owned by another origin' });
            return;
          }
          delete entries[message.integrationId];
          await setStoredEntries(entries);
          await clearAlarmIfEmpty();
          sendResponse({ success: true });
        })().catch(() => sendResponse({ success: false }));

        return true;
      }

      default: {
        sendResponse({ error: `Unknown message type: ${(message as any).type}` });
        break;
      }
    }

    return true;
  }
);
