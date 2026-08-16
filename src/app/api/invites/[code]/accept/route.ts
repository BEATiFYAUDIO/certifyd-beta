import { NextResponse, type NextRequest } from 'next/server';
import { acceptInvite } from '@/lib/beta-service';
import { rateLimit } from '@/lib/rate-limit';
import { inviteCodeSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

function safeReturnPath(value: FormDataEntryValue | null, code: string) {
  const fallback = `/invite/${code}/start/`;
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/^\/invite\/[A-Za-z0-9_-]+\/(start\/|install\/)?$/.test(value)) return value;
  return fallback;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const parsed = inviteCodeSchema.safeParse(code);
  if (!parsed.success) return NextResponse.redirect(new URL('/invite-unavailable/', request.url), 303);

  const acceptLimit = rateLimit(`public-accept:${parsed.data}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!acceptLimit.ok) return NextResponse.redirect(new URL(`/invite/${parsed.data}/?error=rate`, request.url), 303);

  const formData = await request.formData().catch(() => new FormData());
  const returnPath = safeReturnPath(formData.get('returnTo'), parsed.data);
  const result = await acceptInvite(parsed.data);
  const destination = result.ok ? returnPath : `/invite/${parsed.data}/?error=1`;
  return NextResponse.redirect(new URL(destination, request.url), 303);
}
