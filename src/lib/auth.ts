import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getEnv } from './env';

type AdminSession = { admin?: { email: string; loggedInAt: string } };

export function sessionOptions(): SessionOptions {
  const env = getEnv();
  return {
    password: env.SESSION_PASSWORD,
    cookieName: 'certifyd_beta_admin',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    },
  };
}

export async function getSession() {
  return getIronSession<AdminSession>(await cookies(), sessionOptions());
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session.admin) redirect('/?next=/admin');
  return session.admin;
}

export async function verifyAdminPassword(email: string, password: string) {
  const env = getEnv();
  if (!timingSafeEqualString(email.trim().toLowerCase(), env.ADMIN_EMAIL.toLowerCase())) return false;
  const configured = env.ADMIN_PASSWORD;
  if (configured.startsWith('$2a$') || configured.startsWith('$2b$') || configured.startsWith('$2y$')) {
    return bcrypt.compare(password, configured);
  }
  return timingSafeEqualString(password, configured);
}

function timingSafeEqualString(left: string, right: string) {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}
