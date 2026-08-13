import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { InviteStatus } from '@prisma/client';
import { prisma } from './db';
import { buildStaticInviteDto, type StaticInviteDto } from './public-invite';
import { renderPublicHome, renderPublicInvite } from './public-invite-renderer';

export const PUBLIC_OUTPUT_DIR = path.join(process.cwd(), 'generated-public');

export type PublishResult = {
  changed: boolean;
  inviteCount: number;
  outputDir: string;
  message: string;
};

export async function publishPublicSite(contactEmail = publicContactEmail()): Promise<PublishResult> {
  const beforeHash = await hashDirectory(PUBLIC_OUTPUT_DIR);
  const invites = await getPublishedInviteDtos(contactEmail);
  const staging = path.join(process.cwd(), `.generated-public-${crypto.randomBytes(6).toString('hex')}`);
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  await fs.writeFile(path.join(staging, 'index.html'), renderPublicHome());
  await fs.writeFile(path.join(staging, 'CNAME'), 'beta.certifyd.me\n');
  await copyPublicAsset('certifyd-logo.svg', staging);
  await copyPublicAsset('favicon.svg', staging);
  await fs.mkdir(path.join(staging, 'invite'), { recursive: true });
  for (const invite of invites) {
    const inviteDir = path.join(staging, 'invite', invite.code);
    await fs.mkdir(inviteDir, { recursive: true });
    await fs.writeFile(path.join(inviteDir, 'index.html'), renderPublicInvite(invite));
  }
  await scanPublicOutput(staging);
  const stagingHash = await hashDirectory(staging);
  if (beforeHash === stagingHash) {
    await fs.rm(staging, { recursive: true, force: true });
    return { changed: false, inviteCount: invites.length, outputDir: PUBLIC_OUTPUT_DIR, message: 'No public changes detected. Publish skipped.' };
  }
  await fs.rm(PUBLIC_OUTPUT_DIR, { recursive: true, force: true });
  await fs.rename(staging, PUBLIC_OUTPUT_DIR);
  await prisma.invite.updateMany({ where: { published: true, publishedAt: null }, data: { publishedAt: new Date() } });
  return { changed: true, inviteCount: invites.length, outputDir: PUBLIC_OUTPUT_DIR, message: `Published ${invites.length} public invite page${invites.length === 1 ? '' : 's'}.` };
}

export async function getPublishedInviteDtos(contactEmail = publicContactEmail()): Promise<StaticInviteDto[]> {
  const invites = await prisma.invite.findMany({
    where: { published: true, status: { notIn: [InviteStatus.REVOKED, InviteStatus.EXPIRED] } },
    include: { participant: true, participantMission: { include: { mission: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return invites.map((invite) => buildStaticInviteDto(invite, contactEmail)).filter((invite): invite is StaticInviteDto => Boolean(invite));
}

export async function scanPublicOutput(directory = PUBLIC_OUTPUT_DIR) {
  const files = await listFiles(directory);
  const forbiddenFilePatterns = [/\.env/i, /\.db$/i, /\.sqlite/i, /backup/i, /credential/i, /secret/i, /session/i];
  const forbiddenContentPatterns = [
    /founder\s*notes?/i,
    /participantId/i,
    /parentParticipantId/i,
    /networkOriginParticipantId/i,
    /@example\.test/i,
    /DATABASE_URL/i,
    /ADMIN_PASSWORD/i,
    /SESSION_PASSWORD/i,
    /password/i,
    /private\s+milestone/i,
  ];
  for (const file of files) {
    const relative = path.relative(directory, file);
    if (forbiddenFilePatterns.some((pattern) => pattern.test(relative))) throw new Error(`Public output contains forbidden file: ${relative}`);
    const content = await fs.readFile(file, 'utf8');
    const matched = forbiddenContentPatterns.find((pattern) => pattern.test(content));
    if (matched) throw new Error(`Public output privacy scan failed for ${relative}: ${matched}`);
  }
  return { ok: true, files: files.length };
}

export function publicContactEmail() {
  const contact = process.env.BETA_CONTACT_EMAIL || process.env.ADMIN_EMAIL;
  if (!contact) throw new Error('BETA_CONTACT_EMAIL or ADMIN_EMAIL is required to publish public invite pages.');
  return contact;
}


async function copyPublicAsset(fileName: string, outputDir: string) {
  const source = path.join(process.cwd(), 'public', fileName);
  const destination = path.join(outputDir, fileName);
  await fs.copyFile(source, destination);
}

async function hashDirectory(directory: string) {
  try {
    const files = await listFiles(directory);
    const hash = crypto.createHash('sha256');
    for (const file of files) {
      const relative = path.relative(directory, file);
      hash.update(relative);
      hash.update(await fs.readFile(file));
    }
    return hash.digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolute);
    return [absolute];
  }));
  return files.flat().sort();
}
