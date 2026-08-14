import { InviteStatus, type Invite, type Mission, type Participant, type ParticipantMission } from '@prisma/client';
import { getEnv } from './env';

export type StaticInviteDto = {
  code: string;
  displayName: string;
  missionTitle: string;
  missionDescription: string;
  invitationCopy: string;
  contactEmail: string;
  startPath: string | null;
};

export type StaticMissionStartDto = {
  code: string;
  displayName: string;
  missionEyebrow: string;
  missionTitle: string;
  missionDescription: string;
  startHeading: string;
  startIntro: string;
  publicInstructions: string;
  aiPrompt: string;
  successCriteria: string;
  contactEmail: string;
};

export type MailtoLinks = { accept: string; decline: string; help: string; starting: string };

type InviteWithAssignment = Invite & { participant: Participant; participantMission: (ParticipantMission & { mission: Mission }) | null };

export function buildStaticInviteDto(invite: InviteWithAssignment, contactEmail: string): StaticInviteDto | null {
  if (!invite.published) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return null;
  const mission = invite.participantMission?.mission;
  return {
    code: invite.code,
    displayName: invite.participant.name,
    missionTitle: mission?.name || 'Certifyd technical beta',
    missionDescription: mission?.shortDescription || 'Run Certifyd Core in a real creator workflow.',
    invitationCopy: mission?.inviteCopy || "We're opening Certifyd Core to a small number of people during our technical beta.",
    contactEmail,
    startPath: mission?.publicStartEnabled ? `/invite/${invite.code}/start/` : null,
  };
}

export function buildStaticMissionStartDto(invite: InviteWithAssignment, contactEmail: string): StaticMissionStartDto | null {
  if (!invite.published) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return null;
  const assignment = invite.participantMission;
  if (!assignment) return null;
  const mission = assignment?.mission;
  if (!mission?.publicStartEnabled) return null;
  const repositoryUrl = certifydCoreRepositoryUrl();
  const publicInstructions = assignment.publicInstructionsOverride.trim() || mission.publicInstructions.trim() || "Use the AI assistant you're already comfortable with. The important part is that it can read the repository documentation and guide you through your local setup.";
  const missionTitle = mission.name || '01 — Install Certifyd Core';
  const startHeading = mission.startHeading.trim() || stripMissionNumber(missionTitle);
  return {
    code: invite.code,
    displayName: invite.participant.name,
    missionEyebrow: mission.sequence ? `MISSION ${String(mission.sequence).padStart(2, '0')}` : 'MISSION',
    missionTitle,
    missionDescription: mission.shortDescription,
    startHeading,
    startIntro: mission.startIntro.trim() || "You don't need to know how to install Certifyd Core yourself. Start with the AI assistant you already use.",
    publicInstructions,
    aiPrompt: buildAiStarterPrompt(repositoryUrl, mission.aiStarterPrompt),
    successCriteria: mission.successCriteria.trim() || 'Certifyd Core is running on your computer, the local interface opens, and its basic diagnostics are healthy.',
    contactEmail,
  };
}

export function buildMailtoLinks(invite: Pick<StaticInviteDto | StaticMissionStartDto, 'contactEmail' | 'displayName' | 'code' | 'missionTitle'>): MailtoLinks {
  return {
    accept: `/invite/${invite.code}/start/`,
    decline: mailto(invite.contactEmail, `Certifyd Beta — Decline — ${invite.displayName} — ${invite.code}`, `Thanks for the invitation. I'm going to pass on this Certifyd technical beta mission for now.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}\nMission: ${invite.missionTitle}`),
    help: mailto(invite.contactEmail, `Certifyd Beta — Mission 01 Help — ${invite.displayName} — ${invite.code}`, `I'm working through Mission 01 — Install Certifyd Core and need some help.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}`),
    starting: mailto(invite.contactEmail, `Certifyd Beta — Starting Mission 01 — ${invite.displayName} — ${invite.code}`, `I'm starting Mission 01 — Install Certifyd Core.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}`),
  };
}

export function buildAiStarterPrompt(repositoryUrl: string, template = ''): string {
  const fallback = `I have been invited to participate in the Certifyd Core technical beta. I need you to help me install and run Certifyd Core on this computer.

The Certifyd Core repository is:
${repositoryUrl}

Start by determining what operating system I am using and what relevant tools are already installed on my computer.

Then review the Certifyd Core repository and its documentation before giving me installation instructions. Treat the repository documentation as the source of truth rather than guessing how Certifyd Core should be installed.

Guide me through the process one step at a time.

Help me:

1. Check the prerequisites.
2. Install anything required that is missing.
3. Clone Certifyd Core into an appropriate location on my computer.
4. Configure it according to the repository documentation.
5. Start Certifyd Core.
6. Verify that the local interface opens and basic diagnostics are healthy.

Do not make destructive system changes without explaining them first.

If something fails, diagnose the actual error before trying unrelated alternatives.

I am participating in a technical beta, so keep track of anything that is confusing, broken, undocumented, unexpectedly manual, or requires intervention so I can report it back to the Certifyd team.`;
  return template.trim() ? template.replaceAll('{{REPOSITORY_URL}}', repositoryUrl).trim() : fallback;
}

export function certifydCoreRepositoryUrl() {
  const url = getEnv().CERTIFYD_CORE_REPOSITORY_URL;
  if (!url) throw new Error('CERTIFYD_CORE_REPOSITORY_URL is required to publish Mission Start pages.');
  return url;
}

function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function stripMissionNumber(value: string) {
  return value.replace(/^\d+\s*[—-]\s*/, '');
}
