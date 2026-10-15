/**
 * Public pages (privacy policy, support) are served by the same Convex
 * deployment the build talks to — `<name>.convex.cloud` serves the API,
 * `<name>.convex.site` the HTTP routes. Deriving it keeps every link on the
 * backend of this build instead of a hard-coded deployment name.
 */
const PROD_SITE = 'https://proficient-cricket-154.convex.site';

export function siteUrlFrom(convexUrl: string | undefined): string {
  if (!convexUrl) return PROD_SITE;
  const m = /^https:\/\/([a-z0-9-]+)\.convex\.cloud\/?$/i.exec(convexUrl.trim());
  return m ? `https://${m[1]}.convex.site` : PROD_SITE;
}

export const SITE_URL = siteUrlFrom(process.env.EXPO_PUBLIC_CONVEX_URL);
export const PRIVACY_URL = `${SITE_URL}/privacy`;
export const SUPPORT_URL = `${SITE_URL}/support`;
