import { InviteStatus, type Invite, type Mission, type Participant, type ParticipantMission } from '@prisma/client';

export type StaticInviteDto = {
  code: string;
  displayName: string;
  missionTitle: string;
  missionDescription: string;
  invitationCopy: string;
  contactEmail: string;
};

export type MailtoLinks = { accept: string; decline: string };

type InviteWithAssignment = Invite & { participant: Participant; participantMission: (ParticipantMission & { mission: Mission }) | null };

export function buildStaticInviteDto(invite: InviteWithAssignment, contactEmail: string): StaticInviteDto | null {
  if (!invite.published) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return null;
  return {
    code: invite.code,
    displayName: invite.participant.name,
    missionTitle: invite.participantMission?.mission.name || 'Certifyd technical beta',
    missionDescription: invite.participantMission?.mission.shortDescription || 'Run Certifyd Core in a real creator workflow.',
    invitationCopy: invite.participantMission?.mission.inviteCopy || "We're opening Certifyd Core to a small number of people during our technical beta.",
    contactEmail,
  };
}

export function buildMailtoLinks(invite: StaticInviteDto): MailtoLinks {
  return {
    accept: mailto(invite.contactEmail, `Certifyd Beta — Accept — ${invite.displayName} — ${invite.code}`, `I'd like to accept my invitation to participate in the Certifyd technical beta.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}\nMission: ${invite.missionTitle}`),
    decline: mailto(invite.contactEmail, `Certifyd Beta — Decline — ${invite.displayName} — ${invite.code}`, `Thanks for the invitation. I'm going to pass on this Certifyd technical beta mission for now.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}\nMission: ${invite.missionTitle}`),
  };
}

function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
