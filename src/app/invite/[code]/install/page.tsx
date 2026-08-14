export const dynamic = 'force-dynamic';

import { InviteStatus } from '@prisma/client';
import { MissionStartView } from '@/components/invite/MissionStartView';
import { prisma } from '@/lib/db';
import { buildStaticMissionInstallContinuationDto } from '@/lib/public-invite';
import { inviteCodeSchema } from '@/lib/validation';

export default async function InviteInstallPage({ params }: { params: Promise<{ code: string }> }) {
  const routeParams = await params;
  const parsed = inviteCodeSchema.safeParse(routeParams.code);
  if (!parsed.success) return unavailable();
  const invite = await prisma.invite.findFirst({ where: { code: parsed.data }, include: { participant: true, participantMission: { include: { mission: true } } } });
  if (!invite || invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return unavailable();
  const installMission = await prisma.mission.findUnique({ where: { slug: 'install-certifyd-core' } });
  if (!installMission) return unavailable();
  const dto = buildStaticMissionInstallContinuationDto({ ...invite, published: true }, installMission, process.env.BETA_CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'beta-contact@example.test');
  if (!dto) return unavailable();
  return <MissionStartView dto={dto} />;
}

function unavailable() {
  return <main className="main"><div className="container"><section className="panel"><h1>Install mission unavailable.</h1><p className="muted">This invite is expired, revoked, unavailable, or does not include a public install continuation.</p></section></div></main>;
}
