export const dynamic = 'force-dynamic';

import { InviteStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { buildMailtoLinks, buildStaticMissionStartDto } from '@/lib/public-invite';
import { inviteCodeSchema } from '@/lib/validation';
import { CopyPromptButton } from '@/components/CopyPromptButton';

export default async function InviteStartPage({ params }: { params: Promise<{ code: string }> }) {
  const routeParams = await params;
  const parsed = inviteCodeSchema.safeParse(routeParams.code);
  if (!parsed.success) return unavailable();
  const invite = await prisma.invite.findFirst({ where: { code: parsed.data }, include: { participant: true, participantMission: { include: { mission: true } } } });
  if (!invite || invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return unavailable();
  const dto = buildStaticMissionStartDto({ ...invite, published: true }, process.env.BETA_CONTACT_EMAIL || process.env.ADMIN_EMAIL || 'beta-contact@example.test');
  if (!dto) return unavailable();
  const links = buildMailtoLinks(dto);
  return <main className="main"><div className="container"><section className="panel"><p className="eyebrow">{dto.missionEyebrow}</p><h1>{dto.startHeading}</h1><p className="muted lead">{dto.startIntro}</p><div className="panel"><p className="eyebrow">AI starter prompt</p><p className="muted">{dto.publicInstructions}</p><textarea id="ai-prompt" readOnly defaultValue={dto.aiPrompt} /><div className="actions"><CopyPromptButton value={dto.aiPrompt} /><a className="button" href={links.help}>Contact Darryl</a><a className="button" href={links.starting}>Let Darryl know I&apos;m starting</a></div></div><div className="panel"><p className="eyebrow">What success looks like</p><p className="lead">{dto.successCriteria}</p></div><p><a className="button" href={`/invite/${dto.code}/`}>Return to invite</a></p></section></div></main>;
}

function unavailable() {
  return <main className="main"><div className="container"><section className="panel"><h1>Mission start unavailable.</h1><p className="muted">This invite is expired, revoked, unavailable, or has no public start page.</p></section></div></main>;
}
