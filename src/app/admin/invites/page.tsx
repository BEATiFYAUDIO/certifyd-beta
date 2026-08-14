export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { InviteStatus } from '@prisma/client';
import { CopyButton } from '@/components/CopyButton';
import { deleteInviteAction, publishInviteAction, revokeInviteAction, unpublishInviteAction } from '@/lib/actions';
import { prisma } from '@/lib/db';
import { publicInviteUrl, publicMissionInstallUrl, publicMissionStartUrl } from '@/lib/urls';

export default async function InvitesPage() {
  const invites = await prisma.invite.findMany({ include: { participant: true, participantMission: { include: { mission: true } } }, orderBy: { createdAt: 'desc' } });
  return <section className="panel"><h1>Invites</h1><p className="muted">Manage invite publication, revocation and deletion. Deleting an invite does not delete the participant or mission history.</p><table className="table"><thead><tr><th>Participant</th><th>Mission</th><th>Status</th><th>Code</th><th>Public URL</th><th>Activity</th><th>Published</th><th>Actions</th></tr></thead><tbody>{invites.map((invite) => {
    const publicUrl = publicInviteUrl(invite.code);
    const missionStartUrl = invite.participantMission?.mission.publicStartEnabled ? publicMissionStartUrl(invite.code) : '';
    const missionInstallUrl = invite.participantMission?.mission.slug === 'get-ready-to-run-certifyd-core' ? publicMissionInstallUrl(invite.code) : '';
    const unavailable = invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED;
    return <tr key={invite.id}><td><Link href={`/admin/participants/${invite.participantId}`}>{invite.participant.name}</Link><div className="muted">{invite.participant.organizationOrProject || '—'}</div></td><td>{invite.participantMission?.mission.name || '—'}</td><td><span className={`badge ${invite.status === InviteStatus.ACCEPTED ? 'good' : unavailable ? 'bad' : ''}`}>{invite.status}</span></td><td>{invite.codePreview}</td><td>{invite.published && !unavailable ? <div className="grid" style={{ gap: 8 }}><code>{publicUrl}</code><CopyButton value={publicUrl} label="Copy" />{missionStartUrl ? <small className="muted">Start: {missionStartUrl}</small> : null}{missionInstallUrl ? <small className="muted">Install: {missionInstallUrl}</small> : null}</div> : <span className="muted">Not public</span>}</td><td><div>Opened: {invite.openedAt?.toLocaleString() || '—'}</div><div>Accepted: {invite.acceptedAt?.toLocaleString() || '—'}</div><div>Count: {invite.openCount}</div></td><td>{invite.published ? <span className="badge good">Published</span> : <span className="badge">Local only</span>}</td><td><div className="actions">{invite.published ? <form action={unpublishInviteAction}><input type="hidden" name="participantId" value={invite.participantId} /><input type="hidden" name="inviteId" value={invite.id} /><button className="button">Unpublish</button></form> : unavailable ? null : <form action={publishInviteAction}><input type="hidden" name="participantId" value={invite.participantId} /><input type="hidden" name="inviteId" value={invite.id} /><button className="button primary">Publish</button></form>}{unavailable ? null : <form action={revokeInviteAction}><input type="hidden" name="participantId" value={invite.participantId} /><input type="hidden" name="inviteId" value={invite.id} /><input type="hidden" name="deploy" value="1" /><button className="button">Revoke</button></form>}<form action={deleteInviteAction}><input type="hidden" name="participantId" value={invite.participantId} /><input type="hidden" name="inviteId" value={invite.id} /><button className="button danger">Delete</button></form></div></td></tr>;
  })}</tbody></table></section>;
}
