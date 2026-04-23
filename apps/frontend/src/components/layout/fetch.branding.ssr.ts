import type { BrandingData } from '@gitroom/frontend/components/layout/dynamic.branding.provider';

export async function fetchBrandingSSR(
  authCookie: string | undefined
): Promise<BrandingData | null> {
  if (!authCookie) return null;
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backend) return null;
  try {
    const res = await fetch(`${backend}/branding`, {
      headers: { Authorization: `Bearer ${authCookie}`, cookie: `auth=${authCookie}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { branding: BrandingData | null };
    return data?.branding ?? null;
  } catch {
    return null;
  }
}
