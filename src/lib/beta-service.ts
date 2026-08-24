import { InviteStatus, MilestoneStatus, ParticipantMissionStatus, ParticipantStatus, Prisma, type Invite, type Mission, type Participant, type ParticipantMission } from '@prisma/client';
import { prisma } from './db';
import { generateInviteCode, hashInviteCode, previewInviteCode } from './tokens';
import { idSchema, inviteCodeSchema, milestoneSchema, milestoneStatusSchema, missionAssignmentStatusSchema, missionSchema, noteSchema, participantSchema, participantStatusSchema, participantUpdateSchema, progressNoteSchema } from './validation';

export type ParticipantInput = unknown;
const INVITE_OPEN_DEBOUNCE_MS = 15 * 60 * 1000;
const JOURNEY_SLUGS = ['get-ready-to-run-certifyd-core', 'install-certifyd-core', 'set-up-your-core', 'connect-core-to-web', 'publish-your-first-work', 'test-commerce', 'collaborate', 'run-your-own-network'];

type CanonicalMissionDefinition = {
  sequence: number;
  name: string;
  slug: string;
  shortDescription: string;
  inviteCopy: string;
  publicStartEnabled?: boolean;
  startHeading?: string;
  startIntro?: string;
  publicInstructions?: string;
  aiStarterPrompt?: string;
  successCriteria?: string;
  milestones: string[];
};

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
  const firstMissionId = data.missionId || (await defaultFirstMissionId());
  const existing = await prisma.participant.findUnique({ where: { email: data.email } });
  if (existing) {
    if (firstMissionId) {
      await prisma.$transaction((tx) => createAssignmentForMission(tx, existing.id, firstMissionId, ParticipantMissionStatus.ACTIVE));
    }
    await audit(actor, 'participant.existing_email_reused', existing.id, { email: data.email, missionId: firstMissionId });
    return existing;
  }
  const result = await prisma.$transaction(async (tx) => {
    let created: Participant;
    try {
      created = await tx.participant.create({
        data: {
          publicCode: generateInviteCode(),
          name: data.name,
          email: data.email,
          organizationOrProject: data.organizationOrProject,
          roleDescription: data.roleDescription,
          profileUrl: data.profileUrl,
          aiAgent: data.aiAgent,
          operatingSystem: data.operatingSystem,
          parentParticipantId: data.parentParticipantId || null,
          networkOriginParticipantId,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const duplicate = await tx.participant.findUnique({ where: { email: data.email } });
      if (!duplicate) throw error;
      if (firstMissionId) await createAssignmentForMission(tx, duplicate.id, firstMissionId, ParticipantMissionStatus.ACTIVE);
      return { participant: duplicate, created: false };
    }
    if (firstMissionId) await createAssignmentForMission(tx, created.id, firstMissionId, ParticipantMissionStatus.ACTIVE);
    return { participant: created, created: true };
  });
  await audit(actor, result.created ? 'participant.created' : 'participant.existing_email_reused', result.participant.id, { parentParticipantId: data.parentParticipantId || null, networkOriginParticipantId, missionId: firstMissionId });
  return result.participant;
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

export async function updateParticipant(participantId: string, input: unknown, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  const data = participantUpdateSchema.parse(input);
  const now = new Date();
  const participant = await prisma.participant.update({
    where: { id: safeParticipantId },
    data: {
      name: data.name,
      email: data.email,
      organizationOrProject: data.organizationOrProject,
      roleDescription: data.roleDescription,
      profileUrl: data.profileUrl,
      aiAgent: data.aiAgent,
      operatingSystem: data.operatingSystem,
      status: data.status,
      acceptedAt: data.status === ParticipantStatus.ACCEPTED ? now : data.status === ParticipantStatus.INVITED ? null : undefined,
      completedAt: data.status === ParticipantStatus.COMPLETED ? now : data.status === ParticipantStatus.INVITED ? null : undefined,
    },
  });
  await audit(actor, 'participant.updated', safeParticipantId, {
    email: participant.email,
    status: participant.status,
  });
  return participant;
}

export async function deleteParticipant(participantId: string, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  const existing = await prisma.participant.findUnique({
    where: { id: safeParticipantId },
    include: { invites: true },
  });
  if (!existing) return null;
  const hadPublishedInvite = existing.invites.some((invite) => invite.published);
  await prisma.participant.delete({ where: { id: safeParticipantId } });
  await audit(actor, 'participant.deleted', undefined, {
    participantId: safeParticipantId,
    email: existing.email,
    inviteCount: existing.invites.length,
    hadPublishedInvite,
  });
  return { participant: existing, hadPublishedInvite };
}

export async function assignMission(participantId: string, missionId: string, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  const safeMissionId = idSchema.parse(missionId);
  const assignment = await prisma.$transaction(async (tx) => createAssignmentForMission(tx, safeParticipantId, safeMissionId, ParticipantMissionStatus.ASSIGNED));
  await audit(actor, 'participant.mission.assigned', safeParticipantId, { missionId: safeMissionId, participantMissionId: assignment.id });
  return assignment;
}

export async function updateParticipantMissionStatus(participantMissionId: string, status: ParticipantMissionStatus, actor = 'admin') {
  const safeId = idSchema.parse(participantMissionId);
  const safeStatus = missionAssignmentStatusSchema.parse(status);
  const now = new Date();
  const assignment = await prisma.$transaction(async (tx) => {
    const current = await tx.participantMission.findUniqueOrThrow({ where: { id: safeId } });
    if (safeStatus === ParticipantMissionStatus.ACTIVE) {
      await tx.participantMission.updateMany({ where: { participantId: current.participantId, status: ParticipantMissionStatus.ACTIVE, id: { not: safeId } }, data: { status: ParticipantMissionStatus.ASSIGNED } });
    }
    return tx.participantMission.update({
      where: { id: safeId },
      data: {
        status: safeStatus,
        startedAt: safeStatus === ParticipantMissionStatus.ACTIVE ? (current.startedAt || now) : undefined,
        completedAt: safeStatus === ParticipantMissionStatus.COMPLETED ? (current.completedAt || now) : safeStatus === ParticipantMissionStatus.ACTIVE ? null : undefined,
      },
    });
  });
  await audit(actor, 'participant.mission.status.updated', assignment.participantId, { participantMissionId: safeId, status: safeStatus });
  return assignment;
}

export async function advanceToNextMission(participantId: string, actor = 'admin', allowIncomplete = false) {
  const safeParticipantId = idSchema.parse(participantId);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const current = await currentAssignment(tx, safeParticipantId);
    if (!current) throw new Error('No current mission assignment to advance.');
    if (current.status !== ParticipantMissionStatus.COMPLETED && !allowIncomplete) throw new Error('Current mission is not completed. Complete it first or use explicit early advance.');
    if (current.status !== ParticipantMissionStatus.COMPLETED && allowIncomplete) {
      await tx.participantMission.update({ where: { id: current.id }, data: { status: ParticipantMissionStatus.ARCHIVED } });
    }
    const nextMission = await tx.mission.findFirst({ where: { active: true, sequence: { gt: current.sequence } }, orderBy: { sequence: 'asc' } });
    if (!nextMission) throw new Error('No next active mission exists.');
    const next = await createAssignmentForMission(tx, safeParticipantId, nextMission.id, ParticipantMissionStatus.ACTIVE, now);
    return { previous: current, next };
  });
  await audit(actor, 'participant.mission.advanced', safeParticipantId, { previousParticipantMissionId: result.previous.id, nextParticipantMissionId: result.next.id, allowIncomplete });
  return result;
}

export async function generateInvite(participantId: string, actor = 'admin', participantMissionId?: string | null) {
  const safeParticipantId = idSchema.parse(participantId);
  const safeParticipantMissionId = participantMissionId ? idSchema.parse(participantMissionId) : null;
  const assignment = safeParticipantMissionId ? await prisma.participantMission.findFirst({ where: { id: safeParticipantMissionId, participantId: safeParticipantId } }) : await getOrCreateActiveAssignment(safeParticipantId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateInviteCode();
    try {
      const invite = await prisma.invite.create({
        data: {
          participantId: safeParticipantId,
          participantMissionId: assignment?.id || null,
          code,
          codeHash: hashInviteCode(code),
          codePreview: previewInviteCode(code),
          status: InviteStatus.CREATED,
        },
      });
      await audit(actor, 'invite.generated', safeParticipantId, { inviteId: invite.id, participantMissionId: assignment?.id || null });
      return { invite, code };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }
  throw new Error('Failed to generate a unique invite token after multiple attempts.');
}

async function defaultFirstMissionId() {
  const mission = await prisma.mission.findFirst({ where: { active: true }, orderBy: { sequence: 'asc' } });
  return mission?.id || null;
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

export async function deleteInvite(inviteId: string, actor = 'admin') {
  const safeInviteId = idSchema.parse(inviteId);
  const existing = await prisma.invite.findUnique({ where: { id: safeInviteId } });
  if (!existing) return null;
  const invite = await prisma.invite.delete({ where: { id: safeInviteId } });
  await audit(actor, 'invite.deleted', invite.participantId, { inviteId: safeInviteId, codePreview: invite.codePreview, wasPublished: invite.published });
  return invite;
}

export async function regenerateInvite(participantId: string, actor = 'admin', participantMissionId?: string | null) {
  const safeParticipantId = idSchema.parse(participantId);
  const safeParticipantMissionId = participantMissionId ? idSchema.parse(participantMissionId) : undefined;
  await prisma.invite.updateMany({ where: { participantId: safeParticipantId, participantMissionId: safeParticipantMissionId, status: { in: [InviteStatus.CREATED, InviteStatus.OPENED] } }, data: { status: InviteStatus.REVOKED, published: false, publishedAt: null } });
  return generateInvite(safeParticipantId, actor, safeParticipantMissionId);
}

export async function lookupPublicInvite(code: string) {
  const parsedCode = inviteCodeSchema.safeParse(code);
  if (!parsedCode.success) return null;
  const safeCode = parsedCode.data;
  const codeHash = hashInviteCode(safeCode);
  const invite = await prisma.invite.findFirst({
    where: { OR: [{ codeHash }, { code: safeCode }] },
    include: { participant: true, participantMission: { include: { mission: true } } },
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
      data: { status: ParticipantStatus.ACTIVE, acceptedAt: invite.participant.acceptedAt || now },
    });
    if (invite.participantMissionId) {
      const assignment = await tx.participantMission.findUnique({ where: { id: invite.participantMissionId } });
      if (assignment?.status === ParticipantMissionStatus.ASSIGNED) {
        await tx.participantMission.update({ where: { id: invite.participantMissionId }, data: { status: ParticipantMissionStatus.ACTIVE, startedAt: assignment.startedAt || now } });
      }
    }
    await tx.invite.update({ where: { id: invite.id }, data: { status: InviteStatus.ACCEPTED, acceptedAt: invite.acceptedAt || now } });
    return { ok: true, participantName: participant.name };
  });
}

export async function updateProgress(progressId: string, status: MilestoneStatus, note: string, actor = 'admin') {
  const safeProgressId = idSchema.parse(progressId);
  const safeStatus = milestoneStatusSchema.parse(status);
  const completedAt = safeStatus === MilestoneStatus.COMPLETE ? new Date() : null;
  const progress = await prisma.participantMissionProgress.update({ where: { id: safeProgressId }, include: { participantMission: true }, data: { status: safeStatus, note: progressNoteSchema.parse(note || ''), completedAt } });
  await audit(actor, 'participant.progress.updated', progress.participantMission.participantId, { progressId: safeProgressId, participantMissionId: progress.participantMissionId, status: safeStatus });
  return progress;
}

export async function addFounderNote(participantId: string, input: unknown, actor = 'admin') {
  const safeParticipantId = idSchema.parse(participantId);
  const data = noteSchema.parse(input);
  const participantMissionId = data.participantMissionId ? idSchema.parse(data.participantMissionId) : null;
  if (participantMissionId) {
    const assignment = await prisma.participantMission.findFirst({ where: { id: participantMissionId, participantId: safeParticipantId } });
    if (!assignment) throw new Error('Mission assignment does not belong to participant.');
  }
  const note = await prisma.founderNote.create({ data: { participantId: safeParticipantId, participantMissionId, body: data.body } });
  await audit(actor, 'participant.note.created', safeParticipantId, { noteId: note.id, participantMissionId });
  return note;
}

export async function dashboardStats() {
  const counts = await prisma.participant.groupBy({ by: ['status'], _count: true });
  const byStatus = Object.fromEntries(counts.map((row) => [row.status, row._count]));
  byStatus[ParticipantStatus.INVITED] = await prisma.participant.count({
    where: { status: { not: ParticipantStatus.ARCHIVED } },
  });
  byStatus[ParticipantStatus.ACCEPTED] = await prisma.participant.count({
    where: {
      OR: [
        { acceptedAt: { not: null } },
        { invites: { some: { status: InviteStatus.ACCEPTED } } },
      ],
    },
  });
  const stalled = await prisma.participant.findMany({ where: { status: ParticipantStatus.STALLED }, orderBy: { updatedAt: 'asc' }, take: 10 });
  const stageCounts = await prisma.mission.findMany({ where: { active: true }, orderBy: { sequence: 'asc' }, include: { _count: { select: { assignments: { where: { status: ParticipantMissionStatus.COMPLETED } } } } } });
  const blockedAssignments = await prisma.participantMission.findMany({ where: { status: ParticipantMissionStatus.BLOCKED }, include: { participant: true, mission: true }, orderBy: { updatedAt: 'asc' }, take: 10 });
  return { byStatus, stalled, stageCounts, blockedAssignments };
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

export async function ensureCanonicalJourney(actor = 'system') {
  const definitions = canonicalJourneyDefinitions();
  const activeMissionIds: string[] = [];
  for (const definition of definitions) {
    const mission = await prisma.mission.upsert({
      where: { slug: definition.slug },
      update: { name: definition.name, sequence: definition.sequence, shortDescription: definition.shortDescription, inviteCopy: definition.inviteCopy, publicStartEnabled: definition.publicStartEnabled || false, startHeading: definition.startHeading || '', startIntro: definition.startIntro || '', publicInstructions: definition.publicInstructions || '', aiStarterPrompt: definition.aiStarterPrompt || '', successCriteria: definition.successCriteria || '', active: true },
      create: { name: definition.name, slug: definition.slug, sequence: definition.sequence, shortDescription: definition.shortDescription, inviteCopy: definition.inviteCopy, publicStartEnabled: definition.publicStartEnabled || false, startHeading: definition.startHeading || '', startIntro: definition.startIntro || '', publicInstructions: definition.publicInstructions || '', aiStarterPrompt: definition.aiStarterPrompt || '', successCriteria: definition.successCriteria || '', active: true },
    });
    activeMissionIds.push(mission.id);
    for (let index = 0; index < definition.milestones.length; index += 1) {
      const title = definition.milestones[index];
      const existing = await prisma.missionMilestone.findFirst({ where: { missionId: mission.id, title } });
      if (existing) await prisma.missionMilestone.update({ where: { id: existing.id }, data: { sortOrder: index, active: true } });
      else await prisma.missionMilestone.create({ data: { missionId: mission.id, title, sortOrder: index, active: true } });
    }
    await prisma.missionMilestone.updateMany({ where: { missionId: mission.id, title: { notIn: definition.milestones } }, data: { active: false } });
    await prisma.participantMission.updateMany({ where: { missionId: mission.id }, data: { sequence: mission.sequence } });
  }
  await prisma.mission.updateMany({ where: { active: true, id: { notIn: activeMissionIds }, OR: [{ name: 'Run your own creator network' }, { name: 'Run Your Own Creator Network' }] }, data: { active: false } });
  await audit(actor, 'journey.seeded', undefined, { stages: definitions.length });
}

export async function ensurePracticeParticipant(actor = 'system') {
  await ensureCanonicalJourney(actor);
  const ready = await prisma.mission.findUniqueOrThrow({ where: { slug: 'get-ready-to-run-certifyd-core' } });
  const install = await prisma.mission.findUniqueOrThrow({ where: { slug: 'install-certifyd-core' } });
  const participant = await prisma.participant.upsert({
    where: { email: 'darryl@beatifygroup.com' },
    update: { name: 'Darryl Hillock', organizationOrProject: 'Certifyd', roleDescription: 'Founder practice participant', aiAgent: 'Codex', operatingSystem: 'Local machine' },
    create: { publicCode: generateInviteCode(), name: 'Darryl Hillock', email: 'darryl@beatifygroup.com', organizationOrProject: 'Certifyd', roleDescription: 'Founder practice participant', aiAgent: 'Codex', operatingSystem: 'Local machine', status: ParticipantStatus.INVITED },
  });
  const assignment = await prisma.$transaction((tx) => createAssignmentForMission(tx, participant.id, ready.id, ParticipantMissionStatus.ACTIVE));
  const installAssignment = await prisma.participantMission.findUnique({ where: { participantId_missionId: { participantId: participant.id, missionId: install.id } } });
  if (!installAssignment) {
    await prisma.$transaction((tx) => createAssignmentForMission(tx, participant.id, install.id, ParticipantMissionStatus.ASSIGNED));
  }
  const existingInvite = await prisma.invite.findFirst({ where: { participantId: participant.id, participantMissionId: assignment.id, status: { notIn: [InviteStatus.REVOKED, InviteStatus.EXPIRED] } }, orderBy: { createdAt: 'desc' } });
  const invite = existingInvite ? { invite: existingInvite, code: existingInvite.code } : await generateInvite(participant.id, actor, assignment.id);
  await audit(actor, 'practice-participant.ensured', participant.id, { participantMissionId: assignment.id, installMissionId: install.id, inviteId: invite.invite.id });
  return { participant, assignment, invite: invite.invite, code: invite.code };
}

function publicInvitePayload(invite: Invite & { participant: Participant; participantMission: (ParticipantMission & { mission: Mission }) | null }): PublicInviteView {
  return {
    status: invite.status,
    participantName: invite.participant.name,
    missionName: invite.participantMission?.mission.name || 'Certifyd technical beta',
    missionShortDescription: invite.participantMission?.mission.shortDescription || '',
    inviteCopy: invite.participantMission?.mission.inviteCopy || "We're opening Certifyd Core to a small number of people during our technical beta.",
  };
}

async function createAssignmentForMission(tx: Prisma.TransactionClient, participantId: string, missionId: string, status: ParticipantMissionStatus, date = new Date()) {
  const mission = await tx.mission.findUniqueOrThrow({ where: { id: missionId } });
  if (status === ParticipantMissionStatus.ACTIVE) {
    await tx.participantMission.updateMany({ where: { participantId, status: ParticipantMissionStatus.ACTIVE }, data: { status: ParticipantMissionStatus.ASSIGNED } });
  }
  const assignment = await tx.participantMission.upsert({
    where: { participantId_missionId: { participantId, missionId } },
    update: { status, startedAt: status === ParticipantMissionStatus.ACTIVE ? date : undefined },
    create: { participantId, missionId, sequence: mission.sequence, status, assignedAt: date, startedAt: status === ParticipantMissionStatus.ACTIVE ? date : null },
  });
  await createProgressForAssignment(tx, assignment.id, missionId);
  return assignment;
}

async function getOrCreateActiveAssignment(participantId: string) {
  const existing = await prisma.participantMission.findFirst({ where: { participantId, status: ParticipantMissionStatus.ACTIVE }, orderBy: { sequence: 'asc' } });
  if (existing) return existing;
  const mission = await prisma.mission.findFirst({ where: { active: true }, orderBy: { sequence: 'asc' } });
  if (!mission) return null;
  return prisma.$transaction(async (tx) => createAssignmentForMission(tx, participantId, mission.id, ParticipantMissionStatus.ACTIVE));
}

async function createProgressForAssignment(tx: Prisma.TransactionClient, participantMissionId: string, missionId: string) {
  const milestones = await tx.missionMilestone.findMany({ where: { missionId, active: true }, orderBy: { sortOrder: 'asc' } });
  for (const milestone of milestones) {
    await tx.participantMissionProgress.upsert({ where: { participantMissionId_milestoneId: { participantMissionId, milestoneId: milestone.id } }, update: {}, create: { participantMissionId, milestoneId: milestone.id } });
  }
}

async function currentAssignment(tx: Prisma.TransactionClient, participantId: string) {
  return (await tx.participantMission.findFirst({ where: { participantId, status: ParticipantMissionStatus.ACTIVE }, orderBy: { sequence: 'asc' } })) ||
    (await tx.participantMission.findFirst({ where: { participantId }, orderBy: [{ sequence: 'desc' }] }));
}

function canonicalJourneyDefinitions(): CanonicalMissionDefinition[] {
  return [
    {
      sequence: 1,
      name: '01 — Get Ready to Run Certifyd Core',
      slug: JOURNEY_SLUGS[0],
      shortDescription: "Choose how you'll operate Certifyd Core: with an AI coding agent or directly from the command line.",
      inviteCopy: "Your first Certifyd technical beta mission is simple: choose how you'll operate Certifyd Core and confirm you're ready to install it in the next mission.",
      publicStartEnabled: true,
      startHeading: 'Get Ready to Run Certifyd Core',
      startIntro: "Choose how you'll operate Certifyd Core. You can use an AI coding agent or continue directly from the command line if you're comfortable doing that work yourself.",
      publicInstructions: "Choose your path. When your AI coding agent is ready, or you're comfortable operating from the command line, you're ready to continue to Mission 02.",
      successCriteria: "You either have an AI coding agent open, signed in and able to work with local files and commands, or you're comfortable doing those tasks yourself from the command line.",
      milestones: ['Operating path selected', 'AI coding agent ready OR CLI path confirmed', 'Technical beta expectations understood', 'Self-hosting responsibility understood', 'Ready to install Certifyd Core'],
    },
    {
      sequence: 2,
      name: '02 — Install Certifyd Core',
      slug: JOURNEY_SLUGS[1],
      shortDescription: 'Install Certifyd Core and get it running locally.',
      inviteCopy: 'Your Certifyd technical beta mission is to get Certifyd Core cloned, installed, configured, and running locally with your AI coding agent or directly from the command line.',
      publicStartEnabled: true,
      startHeading: 'Install Certifyd Core',
      startIntro: "Use your AI coding agent or the command line to install Certifyd Core from the repository documentation.",
      publicInstructions: "Use the AI assistant you're already comfortable with, or open the repository and follow the installation documentation directly.",
      successCriteria: 'Certifyd Core is running on your computer, the local interface opens, and its basic diagnostics are healthy.',
      milestones: ['Repository cloned', 'Dependencies installed', 'Configuration completed', 'Certifyd Core starts successfully', 'Local interface opens', 'Basic diagnostics healthy'],
    },
    {
      sequence: 3,
      name: '03 — Set Up Your Core',
      slug: JOURNEY_SLUGS[2],
      shortDescription: 'Configure your local Certifyd Core installation for real use.',
      inviteCopy: 'Your next Certifyd technical beta mission is to configure your local Certifyd Core installation for real use before connecting it publicly.',
      milestones: ['Identity/profile established', 'Required local services verified', 'Commerce configuration reviewed', 'Local Core configuration verified', 'Core ready to connect publicly'],
    },
    {
      sequence: 4,
      name: '04 — Connect Your Core to the Web',
      slug: JOURNEY_SLUGS[3],
      shortDescription: 'Connect your Certifyd Core installation to your domain using Cloudflare so your public Certifyd presence can be reached securely from the web.',
      inviteCopy: 'Your next Certifyd technical beta mission is to connect your local Certifyd Core installation to the web through Cloudflare while keeping private/admin surfaces inaccessible publicly.',
      publicStartEnabled: true,
      startHeading: 'Connect Your Core to the Web',
      startIntro: 'Take a working local Core installation and make its intended public surfaces reachable through your domain without exposing private or admin routes.',
      publicInstructions: 'Use your AI coding agent or follow the Certifyd Core documentation directly for Cloudflare Tunnel, public hostname, DNS and route verification.',
      successCriteria: 'Your public Certifyd page is reachable over HTTPS from the web, and private/admin routes are not reachable publicly.',
      milestones: ['Cloudflare account/access ready', 'Domain available in Cloudflare', 'Cloudflare Tunnel configured', 'Certifyd public service connected to tunnel', 'Public hostname/subdomain selected', 'DNS/public hostname configured', 'HTTPS verified', 'Public Certifyd page reachable externally', 'Private/admin routes verified inaccessible publicly'],
    },
    {
      sequence: 5,
      name: '05 — Publish Your First Work',
      slug: JOURNEY_SLUGS[4],
      shortDescription: 'Use Certifyd Core to author or publish a real piece of work.',
      inviteCopy: 'Your next Certifyd technical beta mission is to publish a real creator asset through Certifyd Core and verify the public output.',
      milestones: ['Real work selected', 'Work added to Certifyd Core', 'Metadata completed', 'Ownership/provenance reviewed', 'Published successfully', 'Public output verified'],
    },
    {
      sequence: 6,
      name: '06 — Test Commerce',
      slug: JOURNEY_SLUGS[5],
      shortDescription: 'Use Certifyd commerce in a real transaction or unlock flow.',
      inviteCopy: 'Your next Certifyd technical beta mission is to test the commerce or unlock path currently supported by your Core setup.',
      milestones: ['Paid/unlockable item configured', 'Public purchase/unlock path verified', 'Invoice/payment flow initiated', 'Payment completed', 'Entitlement/unlock verified', 'Settlement/transaction state reviewed'],
    },
    {
      sequence: 7,
      name: '07 — Collaborate',
      slug: JOURNEY_SLUGS[6],
      shortDescription: 'Bring another real person into a collaboration, permissions, splits, publishing, or derivative workflow.',
      inviteCopy: 'Your next Certifyd technical beta mission is to complete a real collaboration or permission workflow with another person.',
      milestones: ['Collaborator identified', 'Collaborator invited', 'Relationship established', 'Split/permission/workflow configured', 'Collaborative action completed', 'Result verified'],
    },
    {
      sequence: 8,
      name: '08 — Run Your Own Network',
      slug: JOURNEY_SLUGS[7],
      shortDescription: 'Bring someone you already work with into Certifyd and operate a real creator relationship through your own Core.',
      inviteCopy: 'Your final Certifyd technical beta mission is to operate Certifyd as your own creator network rather than simply use it alone.',
      milestones: ['Downstream participant identified', 'Personal invite created', 'Participant onboarded', 'Real relationship/workflow completed', 'Commerce/collaboration/publishing tested through network', 'Participant operates flow with minimal founder intervention'],
    },
  ];
}
