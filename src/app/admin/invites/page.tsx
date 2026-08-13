export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';

export default async function InvitesPage() {
  const invites = await prisma.invite.findMany({ include: { participant: true }, orderBy: { createdAt: 'desc' } });
  return <section className="panel"><h1>Invites</h1><table className="table"><thead><tr><th>Participant</th><th>Status</th><th>Code</th><th>Opened</th><th>Accepted</th><th>Open count</th><th>Published</th></tr></thead><tbody>{invites.map((invite) => <tr key={invite.id}><td><Link href={`/admin/participants/${invite.participantId}`}>{invite.participant.name}</Link></td><td><span className="badge">{invite.status}</span></td><td>{invite.codePreview}</td><td>{invite.openedAt?.toLocaleString() || '—'}</td><td>{invite.acceptedAt?.toLocaleString() || '—'}</td><td>{invite.openCount}</td><td>{invite.published ? <span className="badge good">Published</span> : <span className="badge">Local only</span>}</td></tr>)}</tbody></table></section>;
}
