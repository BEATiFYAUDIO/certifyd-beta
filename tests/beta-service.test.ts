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

execFileSync('npx', ['prisma', 'generate'], { cwd: process.cwd(), stdio: 'ignore', env: process.env });
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), stdio: 'ignore', env: process.env });

const [{ prisma }, service, auth, tokens, limiter, { InviteStatus, MilestoneStatus, ParticipantStatus }] = await Promise.all([
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
  await prisma.participantProgress.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.missionMilestone.deleteMany();
  await prisma.mission.deleteMany();
}

async function missionFixture(slug = `mission-${crypto.randomBytes(3).toString('hex')}`) {
  return service.createMission({ name: 'Run your own creator network', slug, shortDescription: 'Run Core in a real workflow.', inviteCopy: 'Use your preferred AI coding agent and work directly with Certifyd.', active: true });
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

test('invite lifecycle tracks debounced opens and acceptance idempotently with public field restrictions', async () => {
  await resetDb();
  const mission = await missionFixture('run-network');
  await service.addMissionMilestone(mission.id, { title: 'Core cloned' });
  const participant = await service.createParticipant({ name: 'Teddy Riley', email: 'teddy@example.test', missionId: mission.id, aiAgent: 'Codex', operatingSystem: 'Windows' });
  const { invite, code } = await service.generateInvite(participant.id);

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

test('revoked, expired and regenerated invites cannot be accepted', async () => {
  await resetDb();
  const mission = await missionFixture('invite-states');
  const participant = await service.createParticipant({ name: 'Tester', email: 'tester@example.test', missionId: mission.id });
  const revoked = await service.generateInvite(participant.id);
  await service.revokeInvite(revoked.invite.id);
  assert.equal((await service.acceptInvite(revoked.code)).ok, false);

  const expired = await service.generateInvite(participant.id);
  await prisma.invite.update({ where: { id: expired.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await service.acceptInvite(expired.code)).ok, false);

  const oldInvite = await service.generateInvite(participant.id);
  await service.regenerateInvite(participant.id);
  assert.equal((await service.acceptInvite(oldInvite.code)).ok, false);
});

test('milestones, founder notes and downstream network origin are preserved', async () => {
  await resetDb();
  const mission = await missionFixture('network-tree');
  const milestone = await service.addMissionMilestone(mission.id, { title: 'Core running' });
  const teddy = await service.createParticipant({ name: 'Teddy', email: 'teddy@example.test', missionId: mission.id });
  const producer = await service.createParticipant({ name: 'Producer', email: 'producer@example.test', missionId: mission.id, parentParticipantId: teddy.id });
  const artist = await service.createParticipant({ name: 'Artist', email: 'artist@example.test', missionId: mission.id, parentParticipantId: producer.id });

  assert.equal(teddy.parentParticipantId, null);
  assert.equal(teddy.networkOriginParticipantId, null);
  assert.equal(producer.parentParticipantId, teddy.id);
  assert.equal(producer.networkOriginParticipantId, teddy.id);
  assert.equal(artist.parentParticipantId, producer.id);
  assert.equal(artist.networkOriginParticipantId, teddy.id);

  const progress = await prisma.participantProgress.findFirstOrThrow({ where: { participantId: teddy.id, milestoneId: milestone.id } });
  await service.updateProgress(progress.id, MilestoneStatus.COMPLETE, 'Installed with Codex.');
  await service.addFounderNote(teddy.id, { body: 'Did not understand the node concept without explanation.' });

  const note = await prisma.founderNote.findFirstOrThrow({ where: { participantId: teddy.id } });
  const updatedProgress = await prisma.participantProgress.findUniqueOrThrow({ where: { id: progress.id } });
  assert.match(note.body, /node concept/);
  assert.equal(updatedProgress.status, MilestoneStatus.COMPLETE);
  assert.ok(updatedProgress.completedAt);

  await service.updateProgress(progress.id, MilestoneStatus.BLOCKED, 'Needs help.');
  const blocked = await prisma.participantProgress.findUniqueOrThrow({ where: { id: progress.id } });
  assert.equal(blocked.status, MilestoneStatus.BLOCKED);
  assert.equal(blocked.completedAt, null);

  await service.updateProgress(progress.id, MilestoneStatus.SKIPPED, 'Not applicable.');
  const skipped = await prisma.participantProgress.findUniqueOrThrow({ where: { id: progress.id } });
  assert.equal(skipped.status, MilestoneStatus.SKIPPED);
  assert.equal(skipped.completedAt, null);

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

test('static public invite DTO contains only allowlisted fields and response mailto links', async () => {
  await resetDb();
  const { buildStaticInviteDto, buildMailtoLinks } = await import('../src/lib/public-invite');
  const mission = await missionFixture('static-mailto');
  const participant = await service.createParticipant({ name: 'Teddy Demo', email: 'teddy-private@example.test', missionId: mission.id });
  await service.addFounderNote(participant.id, { body: 'Founder note must stay private.' });
  const { invite } = await service.generateInvite(participant.id);
  await prisma.invite.update({ where: { id: invite.id }, data: { published: true } });
  const fullInvite = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id }, include: { participant: { include: { mission: true } } } });
  const dto = buildStaticInviteDto(fullInvite, 'beta-contact@example.test');
  assert.ok(dto);
  assert.deepEqual(Object.keys(dto).sort(), ['code', 'contactEmail', 'displayName', 'invitationCopy', 'missionDescription', 'missionTitle'].sort());
  assert.equal(JSON.stringify(dto).includes('teddy-private@example.test'), false);
  assert.equal(JSON.stringify(dto).includes('Founder note'), false);
  assert.equal(JSON.stringify(dto).includes(participant.id), false);
  assert.equal(JSON.stringify(dto).includes('parentParticipantId'), false);
  assert.equal(JSON.stringify(dto).includes('networkOriginParticipantId'), false);
  const links = buildMailtoLinks(dto);
  assert.match(decodeURIComponent(links.accept), /Certifyd Beta — Accept — Teddy Demo/);
  assert.match(decodeURIComponent(links.accept), new RegExp(invite.code));
  assert.match(decodeURIComponent(links.accept), /Mission: Run your own creator network/);
  assert.match(decodeURIComponent(links.decline), /Certifyd Beta — Decline — Teddy Demo/);
  assert.match(decodeURIComponent(links.decline), /pass on the Certifyd technical beta/);
});

test('static publishing omits unpublished invites, removes unpublished pages, and detects no-op publishes', async () => {
  await resetDb();
  process.env.BETA_CONTACT_EMAIL = 'beta-contact@example.test';
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const publisher = await import('../src/lib/static-publisher');
  await fs.rm(publisher.PUBLIC_OUTPUT_DIR, { recursive: true, force: true });
  const mission = await missionFixture('static-publish');
  const participant = await service.createParticipant({ name: 'Public Demo', email: 'public-demo@example.test', missionId: mission.id });
  const { invite } = await service.generateInvite(participant.id);

  let result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  assert.equal(result.inviteCount, 0);
  await assert.rejects(() => fs.stat(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'index.html')));

  await service.publishInvite(invite.id);
  result = await publisher.publishPublicSite();
  assert.equal(result.changed, true);
  assert.equal(result.inviteCount, 1);
  const inviteHtml = await fs.readFile(path.join(publisher.PUBLIC_OUTPUT_DIR, 'invite', invite.code, 'index.html'), 'utf8');
  assert.match(inviteHtml, /Accept Invitation/);
  assert.match(inviteHtml, /Decline/);
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
