import { z } from 'zod';
import { InviteStatus, MilestoneStatus, ParticipantMissionStatus, ParticipantStatus } from '@prisma/client';

export const idSchema = z.string().trim().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/);
export const inviteCodeSchema = z.string().trim().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const participantStatusSchema = z.nativeEnum(ParticipantStatus);
export const milestoneStatusSchema = z.nativeEnum(MilestoneStatus);
export const missionAssignmentStatusSchema = z.nativeEnum(ParticipantMissionStatus);
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

export const participantUpdateSchema = participantSchema
  .omit({ missionId: true, parentParticipantId: true })
  .extend({ status: participantStatusSchema.optional() });

export const missionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  sequence: z.coerce.number().int().min(0).max(999).default(0),
  shortDescription: z.string().trim().min(1).max(280),
  inviteCopy: z.string().trim().min(1).max(1600),
  publicStartEnabled: z.coerce.boolean().optional().default(false),
  startHeading: z.string().trim().max(160).optional().default(''),
  startIntro: z.string().trim().max(1600).optional().default(''),
  publicInstructions: z.string().trim().max(2400).optional().default(''),
  aiStarterPrompt: z.string().trim().max(6000).optional().default(''),
  successCriteria: z.string().trim().max(1000).optional().default(''),
  active: z.coerce.boolean().default(true),
});

export const milestoneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().default(''),
});

export const noteSchema = z.object({ body: z.string().trim().min(1).max(4000), participantMissionId: idSchema.or(z.literal('')).optional().nullable() });
export const progressNoteSchema = z.string().trim().max(1000);
