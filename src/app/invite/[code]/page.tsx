export const dynamic = 'force-dynamic';

import { InviteStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { buildMailtoLinks, buildStaticInviteDto } from '@/lib/public-invite';
import { inviteCodeSchema } from '@/lib/validation';

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const routeParams = await params;
  const parsed = inviteCodeSchema.safeParse(routeParams.code);
  if (!parsed.success) return unavailable();
  const invite = await prisma.invite.findFirst({ where: { code: parsed.data }, include: { participant: true, participantMission: { include: { mission: true } } } });
  if (!invite || invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return unavailable();
  const dto = buildStaticInviteDto({ ...invite, published: true }, process.env.BETA_CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'beta-contact@example.test');
  if (!dto) return unavailable();
  const links = buildMailtoLinks(dto);
  return <main className="main"><div className="container"><section className="panel"><p className="eyebrow">Private Invitation</p><h1>{dto.displayName}, we&apos;d like you to run Certifyd with us.</h1><p className="muted lead">{dto.invitationCopy}</p><div className="panel"><p className="eyebrow">Your Mission</p><h2>{dto.missionTitle}</h2><p className="muted">{dto.missionDescription}</p></div><div className="actions">{dto.startPath ? <a className="button primary" href={dto.startPath}>Accept &amp; Start Mission</a> : <a className="button primary" href={links.help}>Contact Darryl</a>}<a className="button" href={links.decline}>Decline</a></div></section></div></main>;
}

function unavailable() {
  return <main className="main"><div className="container"><section className="panel"><h1>Invitation unavailable.</h1><p className="muted">This invite is expired, revoked, or unavailable.</p></section></div></main>;
}
