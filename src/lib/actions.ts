'use server';

import { ParticipantMissionStatus, ParticipantStatus, MilestoneStatus } from '@prisma/client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession, requireAdmin, verifyAdminPassword } from './auth';
import { acceptInvite, addFounderNote, addMissionMilestone, advanceToNextMission, assignMission, createMission, createParticipant, ensurePracticeParticipant, generateInvite, publishInvite, regenerateInvite, revokeInvite, unpublishInvite, updateParticipantMissionStatus, updateParticipantStatus, updateProgress } from './beta-service';
import { rateLimit } from './rate-limit';
import { publishAndDeployPublicSite } from './git-publisher';
import { publicInviteUrl } from './urls';

function entries(formData: FormData) { return Object.fromEntries(formData.entries()); }

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');
  const loginLimit = rateLimit(`login:${email.trim().toLowerCase() || 'empty'}`, { limit: 8, windowMs: 15 * 60 * 1000 });
  if (!loginLimit.ok || !(await verifyAdminPassword(email, password))) redirect('/?error=1');
  const session = await getSession();
  session.admin = { email: email.toLowerCase(), loggedInAt: new Date().toISOString() };
  await session.save();
  redirect(String(formData.get('next') || '/admin'));
}

export async function logoutAction() {
  const session = await getSession();
  session.destroy();
  redirect('/');
}

export async function createParticipantAction(formData: FormData) {
  const admin = await requireAdmin();
  const participant = await createParticipant(entries(formData), admin.email);
  await generateInvite(participant.id, admin.email);
  revalidatePath('/admin/participants');
  redirect(`/admin/participants/${participant.id}`);
}

export async function statusAction(formData: FormData) {
  const admin = await requireAdmin();
  await updateParticipantStatus(String(formData.get('participantId')), String(formData.get('status')) as ParticipantStatus, admin.email);
  revalidatePath('/admin');
  revalidatePath(`/admin/participants/${formData.get('participantId')}`);
}

export async function assignMissionAction(formData: FormData) {
  const admin = await requireAdmin();
  await assignMission(String(formData.get('participantId')), String(formData.get('missionId')), admin.email);
  revalidatePath('/admin');
  revalidatePath(`/admin/participants/${formData.get('participantId')}`);
}

export async function participantMissionStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  await updateParticipantMissionStatus(String(formData.get('participantMissionId')), String(formData.get('status')) as ParticipantMissionStatus, admin.email);
  revalidatePath('/admin');
  revalidatePath(`/admin/participants/${formData.get('participantId')}`);
}

export async function advanceMissionAction(formData: FormData) {
  const admin = await requireAdmin();
  const participantId = String(formData.get('participantId'));
  await advanceToNextMission(participantId, admin.email, String(formData.get('allowIncomplete') || '') === '1');
  revalidatePath('/admin');
  revalidatePath(`/admin/participants/${participantId}`);
}

export async function noteAction(formData: FormData) {
  const admin = await requireAdmin();
  await addFounderNote(String(formData.get('participantId')), { body: String(formData.get('body') || ''), participantMissionId: String(formData.get('participantMissionId') || '') }, admin.email);
  revalidatePath(`/admin/participants/${formData.get('participantId')}`);
}

export async function progressAction(formData: FormData) {
  const admin = await requireAdmin();
  await updateProgress(String(formData.get('progressId')), String(formData.get('status')) as MilestoneStatus, String(formData.get('note') || ''), admin.email);
  revalidatePath(`/admin/participants/${formData.get('participantId')}`);
}

export async function missionAction(formData: FormData) {
  const admin = await requireAdmin();
  const mission = await createMission(entries(formData), admin.email);
  revalidatePath('/admin/missions');
  redirect(`/admin/missions?created=${mission.id}`);
}

export async function milestoneAction(formData: FormData) {
  const admin = await requireAdmin();
  await addMissionMilestone(String(formData.get('missionId')), { title: String(formData.get('title') || ''), description: String(formData.get('description') || '') }, admin.email);
  revalidatePath('/admin/missions');
}

export async function revokeInviteAction(formData: FormData) {
  const admin = await requireAdmin();
  await revokeInvite(String(formData.get('inviteId')), admin.email);
  revalidatePath(`/admin/participants/${formData.get('participantId')}`);
}

export async function regenerateInviteAction(formData: FormData) {
  const admin = await requireAdmin();
  await regenerateInvite(String(formData.get('participantId')), admin.email, String(formData.get('participantMissionId') || '') || null);
  revalidatePath(`/admin/participants/${formData.get('participantId')}`);
}

export async function publishInviteAction(formData: FormData) {
  const admin = await requireAdmin();
  const participantId = String(formData.get('participantId'));
  await publishInvite(String(formData.get('inviteId')), admin.email);
  await publishAndDeployPublicSite('publish beta invite page');
  revalidatePath(`/admin/participants/${participantId}`);
}

export async function unpublishInviteAction(formData: FormData) {
  const admin = await requireAdmin();
  const participantId = String(formData.get('participantId'));
  await unpublishInvite(String(formData.get('inviteId')), admin.email);
  await publishAndDeployPublicSite('unpublish beta invite page');
  revalidatePath(`/admin/participants/${participantId}`);
}

export async function publishPublicSiteAction() {
  await requireAdmin();
  await publishAndDeployPublicSite('publish beta public site');
  revalidatePath('/admin/invites');
}

export async function ensurePracticeParticipantAction() {
  const admin = await requireAdmin();
  const result = await ensurePracticeParticipant(admin.email);
  revalidatePath('/admin');
  revalidatePath('/admin/participants');
  redirect(`/admin/participants/${result.participant.id}?invite=${encodeURIComponent(publicInviteUrl(result.code))}`);
}

export async function acceptInviteAction(formData: FormData) {
  const code = String(formData.get('code') || '');
  const acceptLimit = rateLimit(`accept:${code}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!acceptLimit.ok) redirect(`/invite/${code}?error=rate`);
  const result = await acceptInvite(code);
  redirect(result.ok ? `/invite/${code}?accepted=1` : `/invite/${code}?error=1`);
}

export async function downstreamAction(formData: FormData) {
  const admin = await requireAdmin();
  const participant = await createParticipant(entries(formData), admin.email);
  const invite = await generateInvite(participant.id, admin.email);
  revalidatePath(`/admin/participants/${formData.get('parentParticipantId')}`);
  redirect(`/admin/participants/${participant.id}?invite=${encodeURIComponent(publicInviteUrl(invite.code))}`);
}
