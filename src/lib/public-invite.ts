import { InviteStatus, type Invite, type Mission, type Participant, type ParticipantMission } from '@prisma/client';
import { getEnv } from './env';
import { publicInviteAcceptUrl } from './urls';

export type StaticInviteDto = {
  code: string;
  displayName: string;
  missionTitle: string;
  missionDescription: string;
  invitationCopy: string;
  contactEmail: string;
  startPath: string | null;
  acceptUrl: string;
  acceptReturnPath: string;
};

export type MissionStartChoice = {
  label: string;
  copy: string;
  actionLabel?: string;
  href?: string;
};

export type StaticMissionStartDto = {
  code: string;
  displayName: string;
  missionEyebrow: string;
  missionTitle: string;
  missionSlug: string;
  missionDescription: string;
  startHeading: string;
  startIntro: string;
  publicInstructions: string;
  aiPrompt: string;
  successCriteria: string;
  contactEmail: string;
  choices: MissionStartChoice[];
  sections: { heading: string; body: string }[];
  repositoryUrl: string | null;
  continuationPath: string | null;
  continuationLabel: string | null;
  continuationIntro: string | null;
};

export type MailtoLinks = { accept: string; decline: string; help: string; starting: string };

type InviteWithAssignment = Invite & { participant: Participant; participantMission: (ParticipantMission & { mission: Mission }) | null };

export function buildStaticInviteDto(invite: InviteWithAssignment, contactEmail: string): StaticInviteDto | null {
  if (!invite.published) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return null;
  const mission = invite.participantMission?.mission;
  const startPath = mission?.publicStartEnabled ? `/invite/${invite.code}/start/` : null;
  return {
    code: invite.code,
    displayName: invite.participant.name,
    missionTitle: mission?.name || 'Certifyd technical beta',
    missionDescription: mission?.shortDescription || 'Run Certifyd Core in a real creator workflow.',
    invitationCopy: mission?.inviteCopy || "We're opening Certifyd Core to a small number of people during our technical beta.",
    contactEmail,
    startPath,
    acceptUrl: publicInviteAcceptUrl(invite.code),
    acceptReturnPath: startPath || `/invite/${invite.code}/`,
  };
}

export function buildStaticMissionStartDto(invite: InviteWithAssignment, contactEmail: string): StaticMissionStartDto | null {
  if (!invite.published) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return null;
  const assignment = invite.participantMission;
  if (!assignment) return null;
  const mission = assignment.mission;
  if (!mission.publicStartEnabled) return null;
  const repositoryUrl = mission.slug === 'get-ready-to-run-certifyd-core' ? null : certifydCoreRepositoryUrl();
  const publicInstructions = assignment.publicInstructionsOverride.trim() || mission.publicInstructions.trim() || defaultPublicInstructions(mission.slug);
  const missionTitle = mission.name;
  const startHeading = mission.startHeading.trim() || stripMissionNumber(missionTitle);
  return {
    code: invite.code,
    displayName: invite.participant.name,
    missionEyebrow: mission.sequence ? `MISSION ${String(mission.sequence).padStart(2, '0')}` : 'MISSION',
    missionTitle,
    missionSlug: mission.slug,
    missionDescription: mission.shortDescription,
    startHeading,
    startIntro: mission.startIntro.trim() || mission.shortDescription,
    publicInstructions,
    aiPrompt: repositoryUrl ? buildAiStarterPrompt(repositoryUrl, mission.aiStarterPrompt, mission.slug) : '',
    successCriteria: mission.successCriteria.trim() || defaultSuccessCriteria(mission.slug),
    contactEmail,
    choices: buildMissionChoices(mission.slug),
    sections: buildMissionSections(mission.slug),
    repositoryUrl,
    continuationPath: mission.slug === 'get-ready-to-run-certifyd-core' ? `/invite/${invite.code}/install/` : null,
    continuationLabel: mission.slug === 'get-ready-to-run-certifyd-core' ? 'Continue — Install Certifyd Core' : null,
    continuationIntro: mission.slug === 'get-ready-to-run-certifyd-core' ? "Great. Next you'll use your AI coding agent — or the command line — to install Certifyd Core." : null,
  };
}

export function buildStaticMissionInstallContinuationDto(invite: InviteWithAssignment, mission: Mission, contactEmail: string): StaticMissionStartDto | null {
  if (!invite.published) return null;
  if (invite.status === InviteStatus.REVOKED || invite.status === InviteStatus.EXPIRED) return null;
  if (invite.participantMission?.mission.slug !== 'get-ready-to-run-certifyd-core') return null;
  if (mission.slug !== 'install-certifyd-core' || !mission.publicStartEnabled) return null;
  const repositoryUrl = certifydCoreRepositoryUrl();
  const missionTitle = mission.name;
  return {
    code: invite.code,
    displayName: invite.participant.name,
    missionEyebrow: 'MISSION 02',
    missionTitle,
    missionSlug: mission.slug,
    missionDescription: mission.shortDescription,
    startHeading: mission.startHeading.trim() || stripMissionNumber(missionTitle),
    startIntro: "Open the coding agent you prepared in Mission 01. Now we're going to give it Certifyd Core and let it guide you through the installation.",
    publicInstructions: mission.publicInstructions.trim() || defaultPublicInstructions(mission.slug),
    aiPrompt: buildAiStarterPrompt(repositoryUrl, mission.aiStarterPrompt, mission.slug),
    successCriteria: mission.successCriteria.trim() || defaultSuccessCriteria(mission.slug),
    contactEmail,
    choices: [],
    sections: [],
    repositoryUrl,
    continuationPath: null,
    continuationLabel: null,
    continuationIntro: null,
  };
}

export function buildMailtoLinks(invite: Pick<StaticInviteDto | StaticMissionStartDto, 'contactEmail' | 'displayName' | 'code' | 'missionTitle'>): MailtoLinks {
  return {
    accept: `/invite/${invite.code}/start/`,
    decline: mailto(invite.contactEmail, `Certifyd Beta — Decline — ${invite.displayName} — ${invite.code}`, `Thanks for the invitation. I'm going to pass on this Certifyd technical beta mission for now.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}\nMission: ${invite.missionTitle}`),
    help: mailto(invite.contactEmail, `Certifyd Beta — ${missionHelpSubject(invite.missionTitle)} — ${invite.displayName} — ${invite.code}`, `I'm working through ${invite.missionTitle} and need some help.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}`),
    starting: mailto(invite.contactEmail, `Certifyd Beta — Starting — ${invite.missionTitle} — ${invite.displayName} — ${invite.code}`, `I'm starting ${invite.missionTitle}.\n\nParticipant: ${invite.displayName}\nInvite: ${invite.code}`),
  };
}

export function buildAiStarterPrompt(repositoryUrl: string, template = '', missionSlug = 'install-certifyd-core'): string {
  if (template.trim()) return template.replaceAll('{{REPOSITORY_URL}}', repositoryUrl).trim();
  if (missionSlug === 'connect-core-to-web') {
    return `I am participating in the Certifyd Core technical beta. I need you to help me connect my local Certifyd Core installation to the web safely.

The Certifyd Core repository and documentation are:
${repositoryUrl}

Start by reading the current Certifyd Core documentation. Treat the repository documentation as the source of truth rather than guessing.

Then inspect my current Certifyd Core and network configuration before giving instructions.

Guide me through the documented Cloudflare Tunnel, public hostname and DNS process one step at a time.

Help me:

1. Confirm my local Certifyd Core installation is running.
2. Confirm I have access to the relevant Cloudflare account and domain.
3. Follow the Certifyd Core documentation for Cloudflare Tunnel and public hostname setup.
4. Connect only the intended public Certifyd surfaces to the web.
5. Avoid exposing private, dashboard, admin, diagnostics, credential or operator routes publicly.
6. Verify HTTPS.
7. Verify the public Certifyd endpoint from outside my machine.
8. Probe private/admin routes externally and confirm they are not reachable.

Do not make destructive DNS, tunnel, credential or routing changes without explaining them first.

If something fails, diagnose the actual error before trying unrelated alternatives.

Keep track of anything that is confusing, undocumented, unexpectedly manual, brittle or requires intervention so I can report it back to the Certifyd team.`;
  }
  return `I have been invited to participate in the Certifyd Core technical beta. I need you to help me install and run Certifyd Core on this computer.

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
}

export function certifydCoreRepositoryUrl() {
  const url = getEnv().CERTIFYD_CORE_REPOSITORY_URL;
  if (!url) throw new Error('CERTIFYD_CORE_REPOSITORY_URL is required to publish Mission Start pages.');
  return url;
}

export function missionExternalLinks() {
  const env = getEnv();
  return { codexUrl: env.CODEX_URL, claudeCodeUrl: env.CLAUDE_CODE_URL };
}

function buildMissionChoices(slug: string): MissionStartChoice[] {
  if (slug !== 'get-ready-to-run-certifyd-core') return [];
  const { codexUrl, claudeCodeUrl } = missionExternalLinks();
  return [
    { label: 'I use ChatGPT', actionLabel: 'Get Codex', href: codexUrl, copy: "Install Codex and sign in with your OpenAI account. Once it can work with local files and commands on your computer, you're ready." },
    { label: 'I use Claude', actionLabel: 'Get Claude Code', href: claudeCodeUrl, copy: "Install Claude Code and sign in with your Anthropic account. Once it can work with local files and commands on your computer, you're ready." },
    { label: 'I already use another coding agent', copy: "That's fine. It needs to be able to work with local files and run commands on your computer." },
    { label: "I'm comfortable with the command line", copy: "You can continue without an AI agent if you're comfortable cloning repositories, installing dependencies, editing configuration, running services, reading logs and troubleshooting from the terminal." },
  ];
}

function buildMissionSections(slug: string): { heading: string; body: string }[] {
  if (slug !== 'get-ready-to-run-certifyd-core') return [];
  return [
    {
      heading: 'This is a technical beta.',
      body: "Certifyd Core is working software, but you're joining before the experience has been packaged for general users. You may encounter setup issues, rough edges, missing instructions, or things that require troubleshooting. That's part of what we're testing. If something is confusing or doesn't work as expected, make a note of it and let us know rather than silently working around it.",
    },
    {
      heading: "You don't need to be a developer.",
      body: "We recommend using an AI coding agent to help with installation, configuration and troubleshooting. If you're comfortable working from the command line, you can also run Certifyd Core directly. AI is optional.",
    },
    {
      heading: "You're operating your own infrastructure.",
      body: "Certifyd Core is yours to run. Instead of depending on a traditional hosted platform, your identity, work, relationships and infrastructure operate under your control. That control comes with responsibility: protect your credentials and keys, keep backups, apply updates, and keep the services you choose to run available. Your AI agent can help with setup, maintenance and troubleshooting, and Certifyd can provide guidance, but the installation remains yours. That is the point. Certifyd minimizes required custody and central intermediaries so independently operated Core installations can connect directly. Keep your keys private, review changes before approving them, and maintain your node like infrastructure that matters.",
    },
  ];
}

function defaultPublicInstructions(slug: string) {
  if (slug === 'get-ready-to-run-certifyd-core') return 'Choose the operating path that fits how you already work. AI is recommended but optional.';
  if (slug === 'connect-core-to-web') return 'Use your AI coding agent or the command line to follow the current Certifyd Core documentation for Cloudflare Tunnel, DNS and public-route verification.';
  return "Use the AI assistant you're already comfortable with. The important part is that it can read the repository documentation and guide you through your local setup.";
}

function defaultSuccessCriteria(slug: string) {
  if (slug === 'get-ready-to-run-certifyd-core') return "You either have an AI coding agent open, signed in and able to work with local files and commands, or you're comfortable doing those tasks yourself from the command line.";
  if (slug === 'connect-core-to-web') return 'Your public Certifyd page is reachable over HTTPS from the web, and private/admin routes are not reachable publicly.';
  return 'Certifyd Core is running on your computer, the local interface opens, and its basic diagnostics are healthy.';
}

function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function stripMissionNumber(value: string) {
  return value.replace(/^\d+\s*[—-]\s*/, '');
}

function missionHelpSubject(missionTitle: string) {
  const match = missionTitle.match(/^(\d+)\s*[—-]\s*(.+)$/);
  if (!match) return `Help — ${missionTitle}`;
  return `Mission ${match[1]} Help — ${match[2]}`;
}
