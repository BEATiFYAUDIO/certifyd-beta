export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { createParticipantAction } from '@/lib/actions';
import { ParticipantStatus } from '@prisma/client';

export default async function ParticipantsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const where = {
    status: query?.status ? query.status as ParticipantStatus : undefined,
    missionId: query?.mission || undefined,
    aiAgent: query?.aiAgent || undefined,
    operatingSystem: query?.operatingSystem || undefined,
    networkOriginParticipantId: query?.networkOrigin || undefined,
  };
  const [participants, missions, origins] = await Promise.all([
    prisma.participant.findMany({ where, include: { mission: true, parentParticipant: true, networkOriginParticipant: true, invites: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } }),
    prisma.mission.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.participant.findMany({ where: { parentParticipantId: null }, orderBy: { name: 'asc' } }),
  ]);
  return <div className="grid"><section className="panel"><h1>Participants</h1><form className="form-grid" action="/admin/participants"><label>Status<select name="status" defaultValue={query?.status || ''}><option value="">All</option>{Object.values(ParticipantStatus).map((s) => <option key={s}>{s}</option>)}</select></label><label>Mission<select name="mission" defaultValue={query?.mission || ''}><option value="">All</option>{missions.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label>AI agent<input name="aiAgent" defaultValue={query?.aiAgent || ''} /></label><label>OS<input name="operatingSystem" defaultValue={query?.operatingSystem || ''} /></label><label>Network origin<select name="networkOrigin" defaultValue={query?.networkOrigin || ''}><option value="">All</option>{origins.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="actions"><button className="button">Filter</button><Link className="button" href="/admin/participants">Clear</Link></div></form></section><section className="panel"><h2>Create participant</h2><form className="form-grid" action={createParticipantAction}><label>Name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Organization/project<input name="organizationOrProject" /></label><label>Role<input name="roleDescription" /></label><label>Profile URL<input name="profileUrl" /></label><label>AI agent<input name="aiAgent" placeholder="Codex" /></label><label>Operating system<input name="operatingSystem" placeholder="Windows" /></label><label>Mission<select name="missionId"><option value="">None</option>{missions.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label><button className="button primary">Create and generate invite</button></form></section><section className="panel"><table className="table"><thead><tr><th>Name</th><th>Status</th><th>Mission</th><th>Invited by</th><th>Origin</th><th>Invite</th></tr></thead><tbody>{participants.map((p) => <tr key={p.id}><td><Link href={`/admin/participants/${p.id}`}>{p.name}</Link><div className="muted">{p.organizationOrProject}</div></td><td><span className="badge">{p.status}</span></td><td>{p.mission?.name || '—'}</td><td>{p.parentParticipant?.name || 'Admin'}</td><td>{p.networkOriginParticipant?.name || 'Root'}</td><td>{p.invites[0]?.status || 'None'}</td></tr>)}</tbody></table></section></div>;
}
