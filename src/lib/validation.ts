import { z } from 'zod';
import { InviteStatus, MilestoneStatus, ParticipantStatus } from '@prisma/client';

export const idSchema = z.string().trim().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/);
export const inviteCodeSchema = z.string().trim().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const participantStatusSchema = z.nativeEnum(ParticipantStatus);
export const milestoneStatusSchema = z.nativeEnum(MilestoneStatus);
export const inviteStatusSchema = z.nativeEnum(InviteStatus);

export const participantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(180),
  organizationOrProject: z.string().trim().max(180).optional().default(''),
  roleDescription: z.string().trim().max(280).optional().default(''),
  profileUrl: z.string().trim().url().or(z.literal('')).optional().default(''),
  aiAgent: z.string().trim().max(80).regex(/^[\w .,+/-]*$/).optional().default(''),
  operatingSystem: z.string().trim().max(80).regex(/^[\w .,+/-]*$/).optional().default(''),
  missionId: idSchema.or(z.literal('')).optional().nullable(),
  parentParticipantId: idSchema.or(z.literal('')).optional().nullable(),
});

export const missionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  shortDescription: z.string().trim().min(1).max(280),
  inviteCopy: z.string().trim().min(1).max(1600),
  active: z.coerce.boolean().default(true),
});

export const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().default(''),
});

export const noteSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const progressNoteSchema = z.string().trim().max(1000);
