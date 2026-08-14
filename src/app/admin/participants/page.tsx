export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { InviteStatus, ParticipantMissionStatus, ParticipantStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createParticipantAction } from '@/lib/actions';

function badgeClass(status: string) {
  if ([InviteStatus.ACCEPTED, ParticipantStatus.ACCEPTED, ParticipantStatus.ACTIVE, ParticipantStatus.COMPLETED].map(String).includes(status)) return 'badge good';
  if ([InviteStatus.REVOKED, InviteStatus.EXPIRED, ParticipantStatus.DECLINED, ParticipantStatus.ARCHIVED, ParticipantStatus.STALLED].map(String).includes(status)) return 'badge bad';
  return 'badge';
}

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
    prisma.participant.findMany({
      where,
      include: {
        parentParticipant: true,
        networkOriginParticipant: true,
        invites: { orderBy: { createdAt: 'desc' }, take: 1 },
        assignments: { include: { mission: true, progress: true }, orderBy: { sequence: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.mission.findMany({ where: { active: true }, orderBy: { sequence: 'asc' } }),
    prisma.participant.findMany({ where: { parentParticipantId: null }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="grid">
      <section className="panel">
        <h1>Participants</h1>
        <form className="form-grid" action="/admin/participants">
          <label>Status<select name="status" defaultValue={query?.status || ''}><option value="">All</option>{Object.values(ParticipantStatus).map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Mission<select name="mission" defaultValue={query?.mission || ''}><option value="">All</option>{missions.map((mission) => <option value={mission.id} key={mission.id}>{mission.name}</option>)}</select></label>
          <label>AI agent<input name="aiAgent" defaultValue={query?.aiAgent || ''} /></label>
          <label>OS<input name="operatingSystem" defaultValue={query?.operatingSystem || ''} /></label>
          <label>Network origin<select name="networkOrigin" defaultValue={query?.networkOrigin || ''}><option value="">All</option>{origins.map((participant) => <option value={participant.id} key={participant.id}>{participant.name}</option>)}</select></label>
          <div className="actions"><button className="button">Filter</button><Link className="button" href="/admin/participants">Clear</Link></div>
        </form>
      </section>

      <section className="panel">
        <h2>Create participant</h2>
        <form className="form-grid" action={createParticipantAction}>
          <label>Name<input name="name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Organization/project<input name="organizationOrProject" /></label>
          <label>Role<input name="roleDescription" /></label>
          <label>Profile URL<input name="profileUrl" /></label>
          <label>AI agent<input name="aiAgent" placeholder="Codex" /></label>
          <label>Operating system<input name="operatingSystem" placeholder="Windows" /></label>
          <label>First mission<select name="missionId"><option value="">None</option>{missions.map((mission) => <option value={mission.id} key={mission.id}>{mission.name}</option>)}</select></label>
          <button className="button primary">Create and generate invite</button>
        </form>
      </section>

      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Participant Status</th>
              <th>Invite Status</th>
              <th>Current Mission</th>
              <th>Mission Status</th>
              <th>Progress</th>
              <th>Network Origin</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => {
              const current = participant.assignments.find((assignment) => assignment.status === ParticipantMissionStatus.ACTIVE) || participant.assignments.find((assignment) => assignment.status === ParticipantMissionStatus.ASSIGNED) || participant.assignments[participant.assignments.length - 1];
              const latestInvite = participant.invites[0];
              const complete = current?.progress.filter((progress) => progress.status === 'COMPLETE').length || 0;
              const total = current?.progress.length || 0;
              return (
                <tr key={participant.id}>
                  <td><Link href={`/admin/participants/${participant.id}`}>{participant.name}</Link><div className="muted">{participant.organizationOrProject}</div></td>
                  <td><span className={badgeClass(participant.status)}>{participant.status}</span></td>
                  <td>{latestInvite ? <><span className={badgeClass(latestInvite.status)}>{latestInvite.status}</span><div className="muted">{latestInvite.published ? 'Published' : 'Not published'} · {latestInvite.codePreview}</div></> : <span className="muted">No invite</span>}</td>
                  <td>{current?.mission.name || '—'}</td>
                  <td>{current?.status || '—'}</td>
                  <td>{total ? `${complete}/${total}` : '—'}</td>
                  <td>{participant.networkOriginParticipant?.name || 'Root'}</td>
                  <td>{participant.updatedAt.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
