import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const baseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://contentbox:contentbox_dev_password@127.0.0.1:5432/contentbox';
const schema = `certifyd_beta_test_${crypto.randomBytes(6).toString('hex')}`;
process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}schema=${schema}`;
process.env.ADMIN_EMAIL = 'admin@example.test';
process.env.ADMIN_PASSWORD = 'very-long-local-password';
process.env.SESSION_PASSWORD = '0123456789abcdef0123456789abcdef';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.PUBLIC_SITE_ORIGIN = 'https://beta.certifyd.me';
process.env.CERTIFYD_CORE_REPOSITORY_URL = 'https://github.com/BEATiFYAUDIO/contentbox';
process.env.CODEX_URL = 'https://github.com/openai/codex';
process.env.CLAUDE_CODE_URL = 'https://docs.anthropic.com/en/docs/claude-code/overview';

execFileSync('npx', ['prisma', 'generate'], { cwd: process.cwd(), stdio: 'ignore', env: process.env });
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), stdio: 'ignore', env: process.env });

const [{ prisma }, service, auth, tokens, limiter, { InviteStatus, MilestoneStatus, ParticipantMissionStatus, ParticipantStatus }] = await Promise.all([
  import('../src/lib/db'),
  import('../src/lib/beta-service'),
  import('../src/lib/auth'),
  import('../src/lib/tokens'),
  import('../src/lib/rate-limit'),
  import('@prisma/client'),
]);

test.after(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await prisma.$disconnect();
});

async function resetDb() {
  limiter.resetRateLimitsForTests();
  await prisma.auditEvent.deleteMany();
  await prisma.founderNote.deleteMany();
  await prisma.participantMissionProgress.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.participantMission.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.missionMilestone.deleteMany();
  await prisma.mission.deleteMany();
}

async function missionFixture(slug = `mission-${crypto.randomBytes(3).toString('hex')}`, sequence = 1) {
  return service.createMission({ name: `Mission ${sequence}`, slug, sequence, shortDescription: 'Run Core in a real workflow.', inviteCopy: 'Use your preferred AI coding agent and work directly with Certifyd.', active: true });
}

test('auth accepts valid credentials and rejects failed login without raw password session dependency', async () => {
  assert.equal(await auth.verifyAdminPassword('admin@example.test', 'very-long-local-password'), true);
  assert.equal(await auth.verifyAdminPassword('admin@example.test', 'wrong-password'), false);
  assert.equal(await auth.verifyAdminPassword('other@example.test', 'very-long-local-password'), false);
});

test('invite tokens are URL-safe, high entropy and unique', async () => {
  const seen = new Set<string>();
  for (let index = 0; index < 250; index += 1) {
    const code = tokens.generateInviteCode();
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.equal(code.length >= 32, true);
    assert.equal(seen.has(code), false);
    seen.add(code);
  }
});


test('invite URL helpers separate local preview from published public URL', async () => {
  const { localPreviewInviteUrl, localPreviewMissionInstallUrl, localPreviewMissionStartUrl, publicInviteUrl, publicMissionInstallUrl, publicMissionStartUrl } = await import('../src/lib/urls');
  const code = 'test-public-code';
  const headers = new Map<string, string>([['host', 'localhost:3001']]);
  const localUrl = localPreviewInviteUrl(code, { get: (name: string) => headers.get(name) || null });
  const publicUrl = publicInviteUrl(code);
  assert.equal(localUrl, 'http://localhost:3001/invite/test-public-code/');
  assert.equal(publicUrl, 'https://beta.certifyd.me/invite/test-public-code/');
  assert.equal(localPreviewMissionStartUrl(code, { get: (name: string) => headers.get(name) || null }), 'http://localhost:3001/invite/test-public-code/start/');
  assert.equal(publicMissionStartUrl(code), 'https://beta.certifyd.me/invite/test-public-code/start/');
  assert.equal(localPreviewMissionInstallUrl(code, { get: (name: string) => headers.get(name) || null }), 'http://localhost:3001/invite/test-public-code/install/');
  assert.equal(publicMissionInstallUrl(code), 'https://beta.certifyd.me/invite/test-public-code/install/');
  assert.equal(publicUrl.includes('localhost'), false);
  assert.notEqual(localUrl, publicUrl);
});

test('copy public URL control receives the configured public URL', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CopyButton } = await import('../src/components/CopyButton');
  const { publicInviteUrl } = await import('../src/lib/urls');
  const publicUrl = publicInviteUrl('copy-code');
  const html = renderToStaticMarkup(React.createElement(CopyButton, { value: publicUrl, label: 'Copy Public URL' }));
  assert.match(html, /Copy Public URL/);
  assert.match(html, /https:\/\/beta\.certifyd\.me\/invite\/copy-code\//);
  assert.equal(html.includes('localhost'), false);
});

test('canonical journey has exactly 8 active stages and preserves migrated install history', async () => {
  await resetDb();
  const oldInstall = await service.createMission({ name: '01 — Install Certifyd Core', slug: 'install-certifyd-core', sequence: 1, shortDescription: 'Old install stage.', inviteCopy: 'Old invite.', active: true });
  const oldMilestone = await service.addMissionMilestone(oldInstall.id, { title: 'Repository cloned' });
  await service.createMission({ name: 'Run your own creator network', slug: 'run-your-own-creator-network', sequence: 0, shortDescription: 'Legacy duplicate.', inviteCopy: 'Legacy.', active: true });
  const participant = await service.createParticipant({ name: 'Migration Tester', email: 'migration@example.test', missionId: oldInstall.id });
  const oldAssignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id, missionId: oldInstall.id } });
  const progress = await prisma.participantMissionProgress.findFirstOrThrow({ where: { participantMissionId: oldAssignment.id, milestoneId: oldMilestone.id } });
  await service.updateProgress(progress.id, MilestoneStatus.COMPLETE, 'Already cloned.');

  await service.ensureCanonicalJourney('test');
  const activeMissions = await prisma.mission.findMany({ where: { active: true }, orderBy: { sequence: 'asc' } });
  assert.deepEqual(activeMissions.map((mission) => mission.name), [
    '01 — Get Ready to Run Certifyd Core',
    '02 — Install Certifyd Core',
    '03 — Set Up Your Core',
    '04 — Connect Your Core to the Web',
    '05 — Publish Your First Work',
    '06 — Test Commerce',
    '07 — Collaborate',
    '08 — Run Your Own Network',
  ]);
  assert.deepEqual(activeMissions.map((mission) => mission.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  const legacy = await prisma.mission.findUniqueOrThrow({ where: { slug: 'run-your-own-creator-network' } });
  assert.equal(legacy.active, false);
  const migrated = await prisma.participantMission.findUniqueOrThrow({ where: { id: oldAssignment.id }, include: { mission: true, progress: true } });
  assert.equal(migrated.mission.name, '02 — Install Certifyd Core');
  assert.equal(migrated.sequence, 2);
  assert.equal(migrated.progress.some((row) => row.status === MilestoneStatus.COMPLETE), true);
});

test('participant can advance through missions without overwriting completed history', async () => {
  await resetDb();
  await service.ensureCanonicalJourney('test');
  const install = await prisma.mission.findUniqueOrThrow({ where: { slug: 'install-certifyd-core' } });
  const setup = await prisma.mission.findUniqueOrThrow({ where: { slug: 'set-up-your-core' } });
  const participant = await service.createParticipant({ name: 'Darryl Hillock', email: 'darryl@example.test', missionId: install.id, aiAgent: 'Codex' });
  let assignments = await prisma.participantMission.findMany({ where: { participantId: participant.id }, include: { progress: true }, orderBy: { sequence: 'asc' } });
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].missionId, install.id);
  assert.equal(assignments[0].status, ParticipantMissionStatus.ACTIVE);
  assert.equal(assignments[0].progress.length, 6);

  const firstProgress = assignments[0].progress[0];
  await service.updateProgress(firstProgress.id, MilestoneStatus.COMPLETE, 'Install step completed.');
  for (const progress of assignments[0].progress.slice(1)) await service.updateProgress(progress.id, MilestoneStatus.COMPLETE, 'Done.');
  await service.updateParticipantMissionStatus(assignments[0].id, ParticipantMissionStatus.COMPLETED);
  await service.advanceToNextMission(participant.id, 'test');

  assignments = await prisma.participantMission.findMany({ where: { participantId: participant.id }, include: { progress: true, mission: true }, orderBy: { sequence: 'asc' } });
  assert.equal(assignments.length, 2);
  assert.equal(assignments[0].missionId, install.id);
  assert.equal(assignments[0].status, ParticipantMissionStatus.COMPLETED);
  assert.equal(assignments[0].progress.filter((progress) => progress.status === MilestoneStatus.COMPLETE).length, 6);
  assert.equal(assignments[1].missionId, setup.id);
  assert.equal(assignments[1].status, ParticipantMissionStatus.ACTIVE);
  assert.equal(assignments[1].progress.length, 5);
});

test('advance refuses incomplete current mission unless explicitly allowed', async () => {
  await resetDb();
  const m1 = await missionFixture('stage-one', 1);
  await service.addMissionMilestone(m1.id, { title: 'One' });
  const m2 = await missionFixture('stage-two', 2);
  await service.addMissionMilestone(m2.id, { title: 'Two' });
  const participant = await service.createParticipant({ name: 'Tester', email: 'tester@example.test', missionId: m1.id });
  await assert.rejects(() => service.advanceToNextMission(participant.id, 'test'));
  await service.advanceToNextMission(participant.id, 'test', true);
  const assignments = await prisma.participantMission.findMany({ where: { participantId: participant.id }, orderBy: { sequence: 'asc' } });
  assert.equal(assignments[0].status, ParticipantMissionStatus.ARCHIVED);
  assert.equal(assignments[1].status, ParticipantMissionStatus.ACTIVE);
});

test('invite lifecycle is tied to one mission assignment and public field restrictions', async () => {
  await resetDb();
  const mission = await missionFixture('run-network');
  await service.addMissionMilestone(mission.id, { title: 'Core cloned' });
  const participant = await service.createParticipant({ name: 'Teddy Riley', email: 'teddy@example.test', missionId: mission.id, aiAgent: 'Codex', operatingSystem: 'Windows' });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  const { invite, code } = await service.generateInvite(participant.id, 'test', assignment.id);

  const publicInvite = await service.lookupPublicInvite(code);
  assert.ok(publicInvite && 'participantName' in publicInvite);
  assert.equal(publicInvite.participantName, 'Teddy Riley');
  assert.equal((publicInvite as Record<string, unknown>).email, undefined);
  assert.equal((publicInvite as Record<string, unknown>).id, undefined);
  assert.equal((publicInvite as Record<string, unknown>).notes, undefined);
  assert.equal(publicInvite.inviteCopy.includes('AI coding agent'), true);

  await service.lookupPublicInvite(code);
  const opened = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } });
  assert.equal(opened.status, InviteStatus.OPENED);
  assert.equal(opened.openCount, 1);
  assert.ok(opened.openedAt);

  const first = await service.acceptInvite(code);
  const second = await service.acceptInvite(code);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const accepted = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } });
  const updatedParticipant = await prisma.participant.findUniqueOrThrow({ where: { id: participant.id } });
  assert.equal(accepted.status, InviteStatus.ACCEPTED);
  assert.equal(updatedParticipant.status, ParticipantStatus.ACCEPTED);
  assert.ok(updatedParticipant.acceptedAt);
});

test('revoked, expired and regenerated mission invites cannot be accepted', async () => {
  await resetDb();
  const mission = await missionFixture('invite-states');
  const participant = await service.createParticipant({ name: 'Tester', email: 'tester2@example.test', missionId: mission.id });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  const revoked = await service.generateInvite(participant.id, 'test', assignment.id);
  await service.revokeInvite(revoked.invite.id);
  assert.equal((await service.acceptInvite(revoked.code)).ok, false);

  const expired = await service.generateInvite(participant.id, 'test', assignment.id);
  await prisma.invite.update({ where: { id: expired.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await service.acceptInvite(expired.code)).ok, false);

  const oldInvite = await service.generateInvite(participant.id, 'test', assignment.id);
  await service.regenerateInvite(participant.id, 'test', assignment.id);
  assert.equal((await service.acceptInvite(oldInvite.code)).ok, false);
});

test('milestones, assignment founder notes and downstream network origin are preserved', async () => {
  await resetDb();
  const mission = await missionFixture('network-tree');
  const milestone = await service.addMissionMilestone(mission.id, { title: 'Core running' });
  const teddy = await service.createParticipant({ name: 'Teddy', email: 'teddy3@example.test', missionId: mission.id });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: teddy.id } });
  const producer = await service.createParticipant({ name: 'Producer', email: 'producer@example.test', missionId: mission.id, parentParticipantId: teddy.id });
  const artist = await service.createParticipant({ name: 'Artist', email: 'artist@example.test', missionId: mission.id, parentParticipantId: producer.id });

  assert.equal(producer.networkOriginParticipantId, teddy.id);
  assert.equal(artist.networkOriginParticipantId, teddy.id);

  const progress = await prisma.participantMissionProgress.findFirstOrThrow({ where: { participantMissionId: assignment.id, milestoneId: milestone.id } });
  await service.updateProgress(progress.id, MilestoneStatus.COMPLETE, 'Installed with Codex.');
  await service.addFounderNote(teddy.id, { body: 'Did not understand the node concept without explanation.', participantMissionId: assignment.id });

  const note = await prisma.founderNote.findFirstOrThrow({ where: { participantId: teddy.id } });
  const updatedProgress = await prisma.participantMissionProgress.findUniqueOrThrow({ where: { id: progress.id } });
  assert.match(note.body, /node concept/);
  assert.equal(note.participantMissionId, assignment.id);
  assert.equal(updatedProgress.status, MilestoneStatus.COMPLETE);
  assert.ok(updatedProgress.completedAt);

  await service.updateProgress(progress.id, MilestoneStatus.BLOCKED, 'Needs help.');
  const blocked = await prisma.participantMissionProgress.findUniqueOrThrow({ where: { id: progress.id } });
  assert.equal(blocked.status, MilestoneStatus.BLOCKED);
  assert.equal(blocked.completedAt, null);

  const tree = await service.getNetworkTree();
  assert.equal(tree[0].name, 'Teddy');
  assert.equal(tree[0].children[0].name, 'Producer');
  assert.equal(tree[0].children[0].children[0].name, 'Artist');
});

test('malformed inputs are rejected server-side', async () => {
  await resetDb();
  await assert.rejects(() => service.createParticipant({ name: '', email: 'not-email' }));
  await assert.rejects(() => service.acceptInvite('../bad'));
  await assert.rejects(() => service.updateParticipantStatus('../bad', ParticipantStatus.ACTIVE));
  await assert.rejects(() => service.addFounderNote('../bad', { body: 'note' }));
});

test('static public invite DTO contains only allowlisted fields and mission-specific mailto links', async () => {
  await resetDb();
  const { buildStaticInviteDto, buildMailtoLinks } = await import('../src/lib/public-invite');
  const { renderPublicInvite } = await import('../src/lib/public-invite-renderer');
  const m1 = await missionFixture('static-mailto-one', 1);
  const m2 = await missionFixture('static-mailto-two', 2);
  const participant = await service.createParticipant({ name: 'Teddy Demo', email: 'teddy-private@example.test', missionId: m1.id });
  const a1 = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id, missionId: m1.id } });
  await service.updateParticipantMissionStatus(a1.id, ParticipantMissionStatus.COMPLETED);
  await service.advanceToNextMission(participant.id, 'test');
  const a2 = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id, missionId: m2.id } });
  await service.addFounderNote(participant.id, { body: 'Founder note must stay private.', participantMissionId: a1.id });
  const { invite } = await service.generateInvite(participant.id, 'test', a2.id);
  await prisma.invite.update({ where: { id: invite.id }, data: { published: true } });
  const fullInvite = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id }, include: { participant: true, participantMission: { include: { mission: true } } } });
  const dto = buildStaticInviteDto(fullInvite, 'beta-contact@example.test');
  assert.ok(dto);
  assert.deepEqual(Object.keys(dto).sort(), ['code', 'contactEmail', 'displayName', 'invitationCopy', 'missionDescription', 'missionTitle', 'startPath'].sort());
  const serialized = JSON.stringify(dto);
  assert.equal(serialized.includes('teddy-private@example.test'), false);
  assert.equal(serialized.includes('Founder note'), false);
  assert.equal(serialized.includes(participant.id), false);
  assert.equal(serialized.includes('static-mailto-one'), false);
  const links = buildMailtoLinks(dto);
  assert.equal(links.accept, `/invite/${dto.code}/start/`);
  assert.match(decodeURIComponent(links.decline), /Mission: Mission 2/);
  const html = renderPublicInvite(dto);
  assert.equal(html.includes('Mission 1'), false);
  assert.equal(html.includes('Founder note'), false);
});


test('published Mission 01 invite generates readiness start page without install instructions', async () => {
  await resetDb();
  await service.ensureCanonicalJourney('test');
  process.env.BETA_CONTACT_EMAIL = 'certifydcreator@gmail.com';
  const { buildStaticMissionStartDto } = await import('../src/lib/public-invite');
  const { renderMissionStart } = await import('../src/lib/public-invite-renderer');
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'get-ready-to-run-certifyd-core' } });
  const participant = await service.createParticipant({ name: 'Ready Demo', email: 'ready-private@example.test', missionId: mission.id, aiAgent: 'Codex' });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  await service.addFounderNote(participant.id, { body: 'Founder note must never publish.', participantMissionId: assignment.id });
  const { invite } = await service.generateInvite(participant.id, 'test', assignment.id);
  await service.publishInvite(invite.id);
  const source = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id }, include: { participant: true, participantMission: { include: { mission: true } } } });
  const start = buildStaticMissionStartDto(source, 'certifydcreator@gmail.com');
  assert.ok(start);
  assert.equal(start.missionEyebrow, 'MISSION 01');
  assert.equal(start.startHeading, 'Get Ready to Run Certifyd Core');
  assert.equal(start.aiPrompt, '');
  assert.equal(start.choices.length, 4);
  const html = renderMissionStart(start);
  assert.match(html, /This is a technical beta/);
  assert.match(html, /I use ChatGPT/);
  assert.match(html, /Get Codex/);
  assert.match(html, /https:\/\/github\.com\/openai\/codex/);
  assert.match(html, /I use Claude/);
  assert.match(html, /Get Claude Code/);
  assert.match(html, /docs\.anthropic\.com\/en\/docs\/claude-code\/overview/);
  assert.match(html, /I already use another coding agent/);
  assert.match(html, /comfortable with the command line/);
  assert.match(html, /AI is optional/);
  assert.match(html, /operating your own infrastructure/);
  assert.match(html, /You(?:&#39;|')re ready when/);
  assert.match(html, /Agent ready\?/);
  assert.match(html, /Continue — Install Certifyd Core/);
  assert.match(html, new RegExp(`/invite/${invite.code}/install/`));
  assert.match(html, /Contact Darryl/);
  assert.equal(html.includes('Let Darryl know'), false);
  assert.equal(html.includes('Clone Certifyd Core'), false);
  assert.equal(html.includes('Repository cloned'), false);
  assert.equal(html.includes('ready-private@example.test'), false);
  assert.equal(html.includes('Founder note'), false);
  assert.equal(html.includes(participant.id), false);
});

test('Mission 01 static continuation generates Mission 02 install page without mutating local state', async () => {
  await resetDb();
  process.env.BETA_CONTACT_EMAIL = 'certifydcreator@gmail.com';
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const publisher = await import('../src/lib/static-publisher');
  await fs.rm(publisher.PUBLIC_OUTPUT_DIR, { recursive: true, force: true });
  await service.ensureCanonicalJourney('test');
  const readyMission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'get-ready-to-run-certifyd-core' } });
  const participant = await service.createParticipant({ name: 'Continuation Demo', email: 'continuation-private@example.test', missionId: readyMission.id });
  const readyAssignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id, missionId: readyMission.id } });
  const { invite } = await service.generateInvite(participant.id, 'test', readyAssignment.id);
  await service.publishInvite(invite.id);

  let result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  const inviteDir = path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code);
  const startHtml = await fs.readFile(path.join(inviteDir, 'start', 'index.html'), 'utf8');
  const installHtml = await fs.readFile(path.join(inviteDir, 'install', 'index.html'), 'utf8');
  assert.match(startHtml, new RegExp(`/invite/${invite.code}/install/`));
  assert.match(startHtml, /Continue — Install Certifyd Core/);
  assert.match(installHtml, /02 — Install Certifyd Core|MISSION 02/);
  assert.match(installHtml, /Open the coding agent you prepared in Mission 01/);
  assert.match(installHtml, /Copy Certifyd Setup Prompt/);
  assert.match(installHtml, /https:\/\/github\.com\/BEATiFYAUDIO\/contentbox/);
  assert.match(installHtml, /Prefer the command line\?/);
  assert.match(installHtml, /Certifyd Core is running on your computer/);
  assert.match(installHtml, /Mission%2002%20Help/);
  assert.equal(installHtml.includes('continuation-private@example.test'), false);
  assert.equal(installHtml.includes(participant.id), false);
  assert.equal(installHtml.includes(readyAssignment.id), false);
  assert.equal(installHtml.includes('participantId'), false);

  const unchangedReadyAssignment = await prisma.participantMission.findUniqueOrThrow({ where: { id: readyAssignment.id } });
  assert.equal(unchangedReadyAssignment.status, ParticipantMissionStatus.ACTIVE);
  const installMission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'install-certifyd-core' } });
  const installAssignment = await prisma.participantMission.findUnique({ where: { participantId_missionId: { participantId: participant.id, missionId: installMission.id } } });
  assert.equal(installAssignment, null);

  result = await publisher.publishPublicSite();
  assert.equal(result.changed, false);
  assert.equal(result.message, 'No public changes detected. Publish skipped.');

  await service.unpublishInvite(invite.id);
  result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  await assert.rejects(() => fs.stat(path.join(inviteDir, 'index.html')));
  await assert.rejects(() => fs.stat(path.join(inviteDir, 'start', 'index.html')));
  await assert.rejects(() => fs.stat(path.join(inviteDir, 'install', 'index.html')));

  await service.publishInvite(invite.id);
  await publisher.publishPublicSite();
  await service.revokeInvite(invite.id);
  result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  await assert.rejects(() => fs.stat(path.join(inviteDir, 'index.html')));
  await assert.rejects(() => fs.stat(path.join(inviteDir, 'start', 'index.html')));
  await assert.rejects(() => fs.stat(path.join(inviteDir, 'install', 'index.html')));
});

test('published Mission 02 invite generates safe install start page and AI prompt', async () => {
  await resetDb();
  await service.ensureCanonicalJourney('test');
  process.env.BETA_CONTACT_EMAIL = 'certifydcreator@gmail.com';
  const { buildStaticMissionStartDto, buildMailtoLinks } = await import('../src/lib/public-invite');
  const { renderMissionStart } = await import('../src/lib/public-invite-renderer');
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'install-certifyd-core' } });
  const participant = await service.createParticipant({ name: 'Darryl Demo', email: 'darryl-private@example.test', missionId: mission.id, aiAgent: 'Codex' });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  await service.addFounderNote(participant.id, { body: 'Founder note must never publish.', participantMissionId: assignment.id });
  const { invite } = await service.generateInvite(participant.id, 'test', assignment.id);
  await service.publishInvite(invite.id);
  const source = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id }, include: { participant: true, participantMission: { include: { mission: true } } } });
  const start = buildStaticMissionStartDto(source, 'certifydcreator@gmail.com');
  assert.ok(start);
  assert.equal(start.missionEyebrow, 'MISSION 02');
  assert.equal(start.startHeading, 'Install Certifyd Core');
  assert.match(start.aiPrompt, /technical beta/);
  assert.match(start.aiPrompt, /https:\/\/github\.com\/BEATiFYAUDIO\/contentbox/);
  assert.match(start.aiPrompt, /operating system/i);
  assert.match(start.aiPrompt, /relevant tools/i);
  assert.match(start.aiPrompt, /repository documentation/i);
  assert.match(start.aiPrompt, /source of truth/i);
  assert.match(start.aiPrompt, /appropriate location/i);
  assert.match(start.aiPrompt, /Configure/i);
  assert.match(start.aiPrompt, /Start Certifyd Core/i);
  assert.match(start.aiPrompt, /diagnostics are healthy/i);
  assert.match(start.aiPrompt, /diagnose the actual error/i);
  assert.match(start.aiPrompt, /confusing, broken, undocumented/i);
  assert.equal(start.aiPrompt.includes('/home/'), false);
  assert.equal(/C:\\/.test(start.aiPrompt), false);
  assert.equal(start.aiPrompt.includes('darryl-private@example.test'), false);
  const html = renderMissionStart(start);
  assert.match(html, /AI coding agent path/);
  assert.match(html, /Copy Certifyd Setup Prompt/);
  assert.match(html, /Open Core Repository/);
  assert.match(html, /Prefer the command line\?/);
  assert.match(html, /follow the installation documentation directly/);
  assert.match(html, /You(?:&#39;|')re done when/);
  assert.match(html, /Contact Darryl/);
  assert.equal(html.includes('Let Darryl know'), false);
  assert.match(html, /mailto:certifydcreator%40gmail.com/);
  assert.equal(html.includes('darryl-private@example.test'), false);
  assert.equal(html.includes('Founder note'), false);
  assert.equal(html.includes(participant.id), false);
  assert.equal(html.includes(assignment.id), false);
  assert.equal(html.includes('participantId'), false);
  assert.equal(html.includes('networkOrigin'), false);
  const links = buildMailtoLinks(start);
  assert.match(decodeURIComponent(links.help), /Mission 02 Help — Install Certifyd Core/);
});

test('Mission 04 start page covers Cloudflare DNS HTTPS and private route verification', async () => {
  await resetDb();
  await service.ensureCanonicalJourney('test');
  const { buildStaticMissionStartDto } = await import('../src/lib/public-invite');
  const { renderMissionStart } = await import('../src/lib/public-invite-renderer');
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'connect-core-to-web' }, include: { milestones: { where: { active: true }, orderBy: { sortOrder: 'asc' } } } });
  assert.equal(mission.sequence, 4);
  assert.equal(mission.milestones.some((milestone) => /Cloudflare Tunnel/.test(milestone.title)), true);
  assert.equal(mission.milestones.some((milestone) => /DNS/.test(milestone.title)), true);
  assert.equal(mission.milestones.some((milestone) => /HTTPS/.test(milestone.title)), true);
  assert.equal(mission.milestones.some((milestone) => /Public Certifyd page reachable/.test(milestone.title)), true);
  assert.equal(mission.milestones.some((milestone) => /Private\/admin routes/.test(milestone.title)), true);
  const participant = await service.createParticipant({ name: 'Cloudflare Demo', email: 'cloudflare-private@example.test', missionId: mission.id });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  const { invite } = await service.generateInvite(participant.id, 'test', assignment.id);
  await service.publishInvite(invite.id);
  const source = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id }, include: { participant: true, participantMission: { include: { mission: true } } } });
  const start = buildStaticMissionStartDto(source, 'certifydcreator@gmail.com');
  assert.ok(start);
  assert.equal(start.missionEyebrow, 'MISSION 04');
  assert.match(start.aiPrompt, /Cloudflare Tunnel/);
  assert.match(start.aiPrompt, /public hostname/);
  assert.match(start.aiPrompt, /DNS/);
  assert.match(start.aiPrompt, /Verify HTTPS/);
  assert.match(start.aiPrompt,  /private\/admin routes/i);
  assert.match(start.aiPrompt, /repository documentation|documentation as the source of truth/i);
  const html = renderMissionStart(start);
  assert.match(html, /Connect Your Core to the Web/);
  assert.equal(html.includes('cloudflare-private@example.test'), false);
  assert.equal(html.includes(participant.id), false);
});

test('static publishing omits unpublished invites, removes unpublished pages, and detects no-op publishes', async () => {
  await resetDb();
  process.env.BETA_CONTACT_EMAIL = 'beta-contact@example.test';
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const publisher = await import('../src/lib/static-publisher');
  await fs.rm(publisher.PUBLIC_OUTPUT_DIR, { recursive: true, force: true });
  await service.ensureCanonicalJourney('test');
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'install-certifyd-core' } });
  const participant = await service.createParticipant({ name: 'Public Demo', email: 'public-demo@example.test', missionId: mission.id });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  const { publicInviteUrl } = await import('../src/lib/urls');
  const { invite } = await service.generateInvite(participant.id, 'test', assignment.id);
  assert.equal(publicInviteUrl(invite.code).startsWith('https://beta.certifyd.me/invite/'), true);
  assert.equal(publicInviteUrl(invite.code).includes('localhost'), false);

  let result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  assert.equal(result.inviteCount, 0);
  await assert.rejects(() => fs.stat(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'index.html')));
  await assert.rejects(() => fs.stat(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'start', 'index.html')));

  await service.publishInvite(invite.id);
  result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  assert.equal(result.inviteCount, 1);
  const inviteHtml = await fs.readFile(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'index.html'), 'utf8');
  const startHtml = await fs.readFile(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'start', 'index.html'), 'utf8');
  assert.match(inviteHtml, /Accept &amp; Start Mission/);
  assert.match(inviteHtml, new RegExp(`/invite/${invite.code}/start/`));
  assert.match(startHtml, /Copy Certifyd Setup Prompt/);
  assert.match(startHtml, /https:\/\/github\.com\/BEATiFYAUDIO\/contentbox/);
  assert.match(inviteHtml, /Decline/);
  assert.match(inviteHtml, /href="mailto:/);
  assert.equal(inviteHtml.includes('href="#"'), false);
  assert.equal(inviteHtml.includes('js-response'), false);
  assert.equal(inviteHtml.includes('public-demo@example.test'), false);
  assert.equal(inviteHtml.includes(participant.id), false);
  await publisher.scanPublicOutput();

  result = await publisher.publishPublicSite();
  assert.equal(result.changed, false);
  assert.equal(result.message, 'No public changes detected. Publish skipped.');

  await service.unpublishInvite(invite.id);
  result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  await assert.rejects(() => fs.stat(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'index.html')));
  await assert.rejects(() => fs.stat(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'start', 'index.html')));
  await assert.rejects(() => fs.stat(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'install', 'index.html')));
});


test('generated public deploy commits only generated-public when static output changed', async () => {
  const { commitAndPushPublicOutput } = await import('../src/lib/git-publisher');
  const calls: string[][] = [];
  const runner = async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'status') return { stdout: ' M generated-public/index.html\n', stderr: '' };
    if (args[0] === 'diff') return { stdout: 'generated-public/index.html\n', stderr: '' };
    return { stdout: '', stderr: '' };
  };
  const result = await commitAndPushPublicOutput('publish beta invite page', runner);
  assert.equal(result.changed, true);
  assert.deepEqual(calls, [
    ['status', '--short', '--', 'generated-public'],
    ['add', '--', 'generated-public'],
    ['diff', '--cached', '--name-only', '--', 'generated-public'],
    ['commit', '-m', 'publish beta invite page', '--', 'generated-public'],
    ['push'],
  ]);
});


test('publishing Mission 01 start page fails clearly without repository URL', async () => {
  await resetDb();
  await service.ensureCanonicalJourney('test');
  const previous = process.env.CERTIFYD_CORE_REPOSITORY_URL;
  delete process.env.CERTIFYD_CORE_REPOSITORY_URL;
  const { buildStaticMissionStartDto } = await import('../src/lib/public-invite');
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'install-certifyd-core' } });
  const participant = await service.createParticipant({ name: 'Missing Repo', email: 'missing-repo@example.test', missionId: mission.id });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  const { invite } = await service.generateInvite(participant.id, 'test', assignment.id);
  await service.publishInvite(invite.id);
  const source = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id }, include: { participant: true, participantMission: { include: { mission: true } } } });
  assert.throws(() => buildStaticMissionStartDto(source, 'beta-contact@example.test'), /CERTIFYD_CORE_REPOSITORY_URL is required/);
  process.env.CERTIFYD_CORE_REPOSITORY_URL = previous;
});

test('journey funnel derives completed stage counts', async () => {
  await resetDb();
  await service.ensureCanonicalJourney('test');
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: 'install-certifyd-core' } });
  const participant = await service.createParticipant({ name: 'Funnel', email: 'funnel@example.test', missionId: mission.id });
  const assignment = await prisma.participantMission.findFirstOrThrow({ where: { participantId: participant.id } });
  await service.updateParticipantMissionStatus(assignment.id, ParticipantMissionStatus.COMPLETED);
  const stats = await service.dashboardStats();
  const stage = stats.stageCounts.find((row) => row.slug === 'install-certifyd-core');
  assert.equal(stage?._count.assignments, 1);
});

test('backup command creates a local gitignored dump file', async () => {
  const fs = await import('node:fs/promises');
  const before = new Set<string>();
  await fs.mkdir('backups', { recursive: true });
  for (const file of await fs.readdir('backups')) before.add(file);
  execFileSync('npm', ['run', 'backup'], { cwd: process.cwd(), stdio: 'ignore', env: process.env });
  const after = await fs.readdir('backups');
  assert.equal(after.some((file) => !before.has(file) && file.endsWith('.sql')), true);
});
