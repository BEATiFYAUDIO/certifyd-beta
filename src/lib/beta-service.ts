import { InviteStatus, MilestoneStatus, ParticipantStatus, Prisma, type Invite, type Mission, type Participant } from '@prisma/client';
import { prisma } from './db';
import { generateInviteCode, hashInviteCode, previewInviteCode } from './tokens';
import { idSchema, inviteCodeSchema, milestoneSchema, milestoneStatusSchema, missionSchema, noteSchema, participantSchema, participantStatusSchema, progressNoteSchema } from './validation';

export type ParticipantInput = unknown;
const INVITE_OPEN_DEBOUNCE_MS = 15 * 60 * 1000;

export type PublicInviteView = {
  status: InviteStatus;
  participantName: string;
  missionName: string;
  missionShortDescription: string;
  inviteCopy: string;
};

export async function audit(actor: string, action: string, participantId?: string, metadata: Record<string, unknown> = {}) {
  await prisma.auditEvent.create({ data: { actor, action, participantId, metadata: JSON.stringify(metadata) } });
}

export async function createMission(input: unknown, actor = 'admin') {
  const data = missionSchema.parse(input);
  const mission = await prisma.mission.create({ data });
  await audit(actor, 'mission.created', undefined, { missionId: mission.id });
  return mission;
}

export async function addMissionMilestone(missionId: string, input: unknown, actor = 'admin') {
  const safeMissionId = idSchema.parse(missionId);
  const data = milestoneSchema.parse(input);
  const max = await prisma.missionMilestone.aggregate({ where: { missionId: safeMissionId }, _max: { sortOrder: true } });
  const milestone = await prisma.missionMilestone.create({
    data: { missionId: safeMissionId, title: data.title, description: data.description, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  await audit(actor, 'mission.milestone.created', undefined, { missionId: safeMissionId, milestoneId: milestone.id });
  return milestone;
}

export async function createParticipant(input: ParticipantInput, actor = 'admin') {
  const data = participantSchema.parse(input);
  const parent = data.parentParticipantId ? await prisma.participant.findUnique({ where: { id: data.parentParticipantId } }) : null;
  const networkOriginParticipantId = parent ? (parent.networkOriginParticipantId || parent.id) : null;
  const participant = await prisma.$transaction(async (tx) => {
    const created = await tx.participant.create({
      data: {
        publicCode: generateInviteCode(),
        name: data.name,
        email: data.email,
        organizationOrProject: data.organizationOrProject,
        roleDescription: data.roleDescription,
        profileUrl: data.profileUrl,
        aiAgent: data.aiAgent,
        operatingSystem: data.operatingSystem,
        missionId: data.missionId || null,
        parentParticipantId: data.parentParticipantId || null,
        networkOriginParticipantId,
      },
    });
    if (created.missionId) await createProgressForMission(tx, created.id, created.missionId);
    return created;
  });
  await audit(actor, 'participant.created', participant.id, { parentParticipantId: data.parentParticipantId || null, networkOriginParticipantId });
  return participant;
}

export async function updateParticipantStatus(participantId: string, status: ParticipantStatus, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  const safeStatus = participantStatusSchema.parse(status);
  const now = new Date();
  const participant = await prisma.participant.update({
    where: { id: safeParticipantId },
    data: {
      status: safeStatus,
      acceptedAt: safeStatus === ParticipantStatus.ACCEPTED ? now : undefined,
      completedAt: safeStatus === ParticipantStatus.COMPLETED ? now : undefined,
    },
  });
  await audit(actor, 'participant.status.updated', safeParticipantId, { status: safeStatus });
  return participant;
}

export async function assignMission(participantId: string, missionId: string, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  const safeMissionId = idSchema.parse(missionId);
  const participant = await prisma.$transaction(async (tx) => {
    await tx.participantProgress.deleteMany({ where: { participantId: safeParticipantId } });
    const updated = await tx.participant.update({ where: { id: safeParticipantId }, data: { missionId: safeMissionId } });
    await createProgressForMission(tx, safeParticipantId, safeMissionId);
    return updated;
  });
  await audit(actor, 'participant.mission.assigned', safeParticipantId, { missionId: safeMissionId });
  return participant;
}

export async function generateInvite(participantId: string, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateInviteCode();
    try {
      const invite = await prisma.invite.create({
        data: {
          participantId: safeParticipantId,
          code,
          codeHash: hashInviteCode(code),
          codePreview: previewInviteCode(code),
          status: InviteStatus.CREATED,
        },
      });
      await audit(actor, 'invite.generated', safeParticipantId, { inviteId: invite.id });
      return { invite, code };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }
  throw new Error('Failed to generate a unique invite token after multiple attempts.');
}

export async function revokeInvite(inviteId: string, actor = 'admin') {
  const safeInviteId = idSchema.parse(inviteId);
  const invite = await prisma.invite.update({ where: { id: safeInviteId }, data: { status: InviteStatus.REVOKED, published: false, publishedAt: null } });
  await audit(actor, 'invite.revoked', invite.participantId, { inviteId });
  return invite;
}

export async function publishInvite(inviteId: string, actor = 'admin') {
  const safeInviteId = idSchema.parse(inviteId);
  const invite = await prisma.invite.update({ where: { id: safeInviteId }, data: { published: true } });
  await audit(actor, 'invite.published', invite.participantId, { inviteId: safeInviteId });
  return invite;
}

export async function unpublishInvite(inviteId: string, actor = 'admin') {
  const safeInviteId = idSchema.parse(inviteId);
  const invite = await prisma.invite.update({ where: { id: safeInviteId }, data: { published: false, publishedAt: null } });
  await audit(actor, 'invite.unpublished', invite.participantId, { inviteId: safeInviteId });
  return invite;
}

export async function regenerateInvite(participantId: string, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  await prisma.invite.updateMany({ where: { participantId: safeParticipantId, status: { in: [InviteStatus.CREATED, InviteStatus.OPENED] } }, data: { status: InviteStatus.REVOKED, published: false, publishedAt: null } });
  return generateInvite(safeParticipantId, actor);
}

export async function lookupPublicInvite(code: string) {
  const parsedCode = inviteCodeSchema.safeParse(code);
  if (!parsedCode.success) return null;
  const safeCode = parsedCode.data;
  const codeHash = hashInviteCode(safeCode);
  const invite = await prisma.invite.findFirst({
    where: { OR: [{ codeHash }, { code: safeCode }] },
    include: { participant: { include: { mission: true } } },
  });
  if (!invite) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return { status: invite.status as InviteStatus };
  const now = new Date();
  if (invite.expiresAt && invite.expiresAt < now) {
    await prisma.invite.update({ where: { id: invite.id }, data: { status: InviteStatus.EXPIRED } });
    return { status: InviteStatus.EXPIRED };
  }
  if (!invite.lastOpenedAt || now.getTime() - invite.lastOpenedAt.getTime() > INVITE_OPEN_DEBOUNCE_MS) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: {
        status: invite.status === InviteStatus.CREATED ? InviteStatus.OPENED : invite.status,
        openedAt: invite.openedAt || now,
        lastOpenedAt: now,
        openCount: { increment: 1 },
      },
    });
  } else if (invite.status === InviteStatus.CREATED) {
    await prisma.invite.update({ where: { id: invite.id }, data: { status: InviteStatus.OPENED, openedAt: invite.openedAt || now } });
  }
  return publicInvitePayload(invite);
}

export async function acceptInvite(code: string) {
  const safeCode = inviteCodeSchema.parse(code);
  const codeHash = hashInviteCode(safeCode);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const invite = await tx.invite.findFirst({ where: { OR: [{ codeHash }, { code: safeCode }] }, include: { participant: true } });
    if (!invite || invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return { ok: false, reason: 'unavailable' as const };
    if (invite.expiresAt && invite.expiresAt < now) {
      await tx.invite.update({ where: { id: invite.id }, data: { status: InviteStatus.EXPIRED } });
      return { ok: false, reason: 'expired' as const };
    }
    const participant = await tx.participant.update({
      where: { id: invite.participantId },
      data: { status: invite.participant.status === ParticipantStatus.INVITED ? ParticipantStatus.ACCEPTED : invite.participant.status, acceptedAt: invite.participant.acceptedAt || now },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { status: InviteStatus.ACCEPTED, acceptedAt: invite.acceptedAt || now } });
    return { ok: true, participantName: participant.name };
  });
}

export async function updateProgress(progressId: string, status: MilestoneStatus, note: string, actor = 'admin') {
  const safeProgressId = idSchema.parse(progressId);
  const safeStatus = milestoneStatusSchema.parse(status);
  const completedAt = safeStatus === MilestoneStatus.COMPLETE ? new Date() : null;
  const progress = await prisma.participantProgress.update({ where: { id: safeProgressId }, data: { status: safeStatus, note: progressNoteSchema.parse(note || ''), completedAt } });
  await audit(actor, 'participant.progress.updated', progress.participantId, { progressId: safeProgressId, status: safeStatus });
  return progress;
}

export async function addFounderNote(participantId: string, input: unknown, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  const data = noteSchema.parse(input);
  const note = await prisma.founderNote.create({ data: { participantId: safeParticipantId, body: data.body } });
  await audit(actor, 'participant.note.created', safeParticipantId, { noteId: note.id });
  return note;
}

export async function dashboardStats() {
  const counts = await prisma.participant.groupBy({ by: ['status'], _count: true });
  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row._count]));
  const stalled = await prisma.participant.findMany({ where: { status: ParticipantStatus.STALLED }, orderBy: { updatedAt: 'asc' }, take: 10 });
  return { byStatus, stalled };
}

export async function getNetworkTree() {
  const participants = await prisma.participant.findMany({ orderBy: [{ createdAt: 'asc' }] });
  return buildParticipantTree(participants);
}

export type ParticipantTreeNode = Pick<Participant, 'id' | 'name' | 'status'> & { children: ParticipantTreeNode[] };

export function buildParticipantTree(participants: Pick<Participant, 'id' | 'name' | 'status' | 'parentParticipantId'>[]): ParticipantTreeNode[] {
  const byParent = new Map<string, typeof participants>();
  for (const participant of participants) {
    const key = participant.parentParticipantId || 'root';
    byParent.set(key, [...(byParent.get(key) || []), participant]);
  }
  const build = (parentId: string | null): ParticipantTreeNode[] => (
    (byParent.get(parentId || 'root') || []).map((participant) => ({
      id: participant.id,
      name: participant.name,
      status: participant.status,
      children: build(participant.id),
    }))
  );
  return build(null);
}

function publicInvitePayload(invite: Invite & { participant: Participant & { mission: Mission | null } }): PublicInviteView {
  return {
    status: invite.status,
    participantName: invite.participant.name,
    missionName: invite.participant.mission?.name || 'Certifyd technical beta',
    missionShortDescription: invite.participant.mission?.shortDescription || '',
    inviteCopy: invite.participant.mission?.inviteCopy || "We're opening Certifyd Core to a small number of people during our technical beta.",
  };
}

async function createProgressForMission(tx: Prisma.TransactionClient, participantId: string, missionId: string) {
  const milestones = await tx.missionMilestone.findMany({ where: { missionId }, orderBy: { sortOrder: 'asc' } });
  for (const milestone of milestones) {
    await tx.participantProgress.create({ data: { participantId, milestoneId: milestone.id } });
  }
}
