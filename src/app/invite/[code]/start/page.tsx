export const dynamic = 'force-dynamic';

import { InviteStatus } from '@prisma/client';
import { MissionStartView } from '@/components/invite/MissionStartView';
import { prisma } from '@/lib/db';
import { buildStaticMissionStartDto } from '@/lib/public-invite';
import { inviteCodeSchema } from '@/lib/validation';

export default async function InviteStartPage({ params }: { params: Promise<{ code: string }> }) {
  const routeParams = await params;
  const parsed = inviteCodeSchema.safeParse(routeParams.code);
  if (!parsed.success) return unavailable();
  const invite = await prisma.invite.findFirst({ where: { code: parsed.data }, include: { participant: true, participantMission: { include: { mission: true } } } });
  if (!invite || invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return unavailable();
  const dto = buildStaticMissionStartDto({ ...invite, published: true }, process.env.BETA_CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'beta-contact@example.test');
  if (!dto) return unavailable();
  return <MissionStartView dto={dto} />;
}

function unavailable() {
  return <main className="main"><div className="container"><section className="panel"><h1>Mission start unavailable.</h1><p className="muted">This invite is expired, revoked, unavailable, or has no public start page.</p></section></div></main>;
}
