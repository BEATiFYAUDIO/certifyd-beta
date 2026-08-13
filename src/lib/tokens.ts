import crypto from 'node:crypto';

export function generateInviteCode() {
  return crypto.randomBytes(24).toString('base64url');
}

export function hashInviteCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function previewInviteCode(code: string) {
  return `${code.slice(0, 6)}…${code.slice(-4)}`;
}
