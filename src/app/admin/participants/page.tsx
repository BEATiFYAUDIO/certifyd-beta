export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ParticipantMissionStatus, ParticipantStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createParticipantAction } from '@/lib/actions';

export default async function ParticipantsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const query = await searchParams;
  const where = {
    status: query?.status ? query.status as ParticipantStatus : undefined,
    aiAgent: query?.aiAgent || undefined,
    operatingSystem: query?.operatingSystem || undefined,
    networkOriginParticipantId: query?.networkOrigin || undefined,
    assignments: query?.mission ? { some: { missionId: query.mission } } : undefined,
  };
  const [participants, missions, origins] = await Promise.all([
    prisma.participant.findMany({ where, include: { parentParticipant: true, networkOriginParticipant: true, invites: { orderBy: { createdAt: 'desc' }, take: 1 }, assignments: { include: { mission: true, progress: true }, orderBy: { sequence: 'asc' } } }, orderBy: { updatedAt: 'desc' } }),
    prisma.mission.findMany({ where: { active: true }, orderBy: { sequence: 'asc' } }),
    prisma.participant.findMany({ where: { parentParticipantId: null }, orderBy: { name: 'asc' } }),
  ]);
  return <div className="grid"><section className="panel"><h1>Participants</h1><form className="form-grid" action="/admin/participants"><label>Status<select name="status" defaultValue={query?.status || ''}><option value="">All</option>{Object.values(ParticipantStatus).map((s) => <option key={s}>{s}</option>)}</select></label><label>Mission<select name="mission" defaultValue={query?.mission || ''}><option value="">All</option>{missions.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label>AI agent<input name="aiAgent" defaultValue={query?.aiAgent || ''} /></label><label>OS<input name="operatingSystem" defaultValue={query?.operatingSystem || ''} /></label><label>Network origin<select name="networkOrigin" defaultValue={query?.networkOrigin || ''}><option value="">All</option>{origins.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><div className="actions"><button className="button">Filter</button><Link className="button" href="/admin/participants">Clear</Link></div></form></section><section className="panel"><h2>Create participant</h2><form className="form-grid" action={createParticipantAction}><label>Name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Organization/project<input name="organizationOrProject" /></label><label>Role<input name="roleDescription" /></label><label>Profile URL<input name="profileUrl" /></label><label>AI agent<input name="aiAgent" placeholder="Codex" /></label><label>Operating system<input name="operatingSystem" placeholder="Windows" /></label><label>First mission<select name="missionId"><option value="">None</option>{missions.map((m) => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label><button className="button primary">Create and generate invite</button></form></section><section className="panel"><table className="table"><thead><tr><th>Participant</th><th>Overall Status</th><th>Current Mission</th><th>Current Mission Status</th><th>Mission Progress</th><th>Network Origin</th><th>Last Updated</th></tr></thead><tbody>{participants.map((p) => {
    const current = p.assignments.find((a) => a.status === ParticipantMissionStatus.ACTIVE) || p.assignments.find((a) => a.status === ParticipantMissionStatus.ASSIGNED) || p.assignments[p.assignments.length - 1];
    const complete = current?.progress.filter((progress) => progress.status === 'COMPLETE').length || 0;
    const total = current?.progress.length || 0;
    return <tr key={p.id}><td><Link href={`/admin/participants/${p.id}`}>{p.name}</Link><div className="muted">{p.organizationOrProject}</div></td><td><span className="badge">{p.status}</span></td><td>{current?.mission.name || '—'}</td><td>{current?.status || '—'}</td><td>{total ? `${complete}/${total}` : '—'}</td><td>{p.networkOriginParticipant?.name || 'Root'}</td><td>{p.updatedAt.toLocaleString()}</td></tr>;
  })}</tbody></table></section></div>;
}
