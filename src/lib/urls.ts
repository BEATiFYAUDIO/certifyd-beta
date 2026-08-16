export const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://beta.certifyd.me';

export function publicSiteOrigin() {
  return normalizeOrigin(process.env.PUBLIC_SITE_ORIGIN || DEFAULT_PUBLIC_SITE_ORIGIN);
}

export function publicInviteUrl(code: string, origin = publicSiteOrigin()) {
  return `${normalizeOrigin(origin)}/invite/${code}/`;
}

export function publicMissionStartUrl(code: string, origin = publicSiteOrigin()) {
  return `${normalizeOrigin(origin)}/invite/${code}/start/`;
}

export function publicMissionInstallUrl(code: string, origin = publicSiteOrigin()) {
  return `${normalizeOrigin(origin)}/invite/${code}/install/`;
}

export function acceptCallbackOrigin() {
  return normalizeOrigin(process.env.BETA_ACCEPT_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001');
}

export function publicInviteAcceptUrl(code: string, origin = acceptCallbackOrigin()) {
  return `${normalizeOrigin(origin)}/api/invites/${code}/accept`;
}

export function requirePublicAcceptCallbackOrigin() {
  const origin = acceptCallbackOrigin();
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new Error('BETA_ACCEPT_ORIGIN must point to the reachable beta app before publishing public invites. Static GitHub Pages cannot update dashboard status by itself.');
  }
  return origin;
}

export function localPreviewOrigin(headers?: { get(name: string): string | null }) {
  const host = headers?.get('host') || process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '') || 'localhost:3001';
  const forwardedProto = headers?.get('x-forwarded-proto');
  const protocol = forwardedProto || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

export function localPreviewInviteUrl(code: string, headers?: { get(name: string): string | null }) {
  return `${localPreviewOrigin(headers)}/invite/${code}/`;
}

export function localPreviewMissionStartUrl(code: string, headers?: { get(name: string): string | null }) {
  return `${localPreviewOrigin(headers)}/invite/${code}/start/`;
}

export function localPreviewMissionInstallUrl(code: string, headers?: { get(name: string): string | null }) {
  return `${localPreviewOrigin(headers)}/invite/${code}/install/`;
}

function normalizeOrigin(origin: string) {
  return origin.replace(/\/+$/, '');
}
