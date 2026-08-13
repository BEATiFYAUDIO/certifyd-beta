-- CreateEnum
CREATE TYPE "ParticipantMissionStatus" AS ENUM ('ASSIGNED', 'ACTIVE', 'BLOCKED', 'COMPLETED', 'SKIPPED', 'ARCHIVED');

-- Add mission ordering before assignment migration.
CREATE UNIQUE INDEX IF NOT EXISTS "Participant_email_key" ON "Participant"("email");
ALTER TABLE "Mission" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Mission_sequence_idx" ON "Mission"("sequence");

-- CreateTable
CREATE TABLE "ParticipantMission" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "status" "ParticipantMissionStatus" NOT NULL DEFAULT 'ASSIGNED',
    "sequence" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipantMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantMissionProgress" (
    "id" TEXT NOT NULL,
    "participantMissionId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "note" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipantMissionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantMission_participantId_missionId_key" ON "ParticipantMission"("participantId", "missionId");
CREATE INDEX "ParticipantMission_participantId_status_idx" ON "ParticipantMission"("participantId", "status");
CREATE INDEX "ParticipantMission_participantId_sequence_idx" ON "ParticipantMission"("participantId", "sequence");
CREATE INDEX "ParticipantMission_missionId_idx" ON "ParticipantMission"("missionId");
CREATE UNIQUE INDEX "ParticipantMissionProgress_participantMissionId_milestoneId_key" ON "ParticipantMissionProgress"("participantMissionId", "milestoneId");
CREATE INDEX "ParticipantMissionProgress_participantMissionId_idx" ON "ParticipantMissionProgress"("participantMissionId");

-- AddForeignKey
ALTER TABLE "ParticipantMission" ADD CONSTRAINT "ParticipantMission_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantMission" ADD CONSTRAINT "ParticipantMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParticipantMissionProgress" ADD CONSTRAINT "ParticipantMissionProgress_participantMissionId_fkey" FOREIGN KEY ("participantMissionId") REFERENCES "ParticipantMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParticipantMissionProgress" ADD CONSTRAINT "ParticipantMissionProgress_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "MissionMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing single-mission relationships as first assignment records.
INSERT INTO "ParticipantMission" ("id", "participantId", "missionId", "status", "sequence", "assignedAt", "startedAt", "completedAt", "createdAt", "updatedAt")
SELECT
  'pm_' || md5(p."id" || ':' || p."missionId"),
  p."id",
  p."missionId",
  CASE
    WHEN p."status" = 'COMPLETED' THEN 'COMPLETED'::"ParticipantMissionStatus"
    WHEN p."status" = 'STALLED' THEN 'BLOCKED'::"ParticipantMissionStatus"
    WHEN p."status" IN ('ACCEPTED', 'INSTALLING', 'ACTIVE') THEN 'ACTIVE'::"ParticipantMissionStatus"
    ELSE 'ASSIGNED'::"ParticipantMissionStatus"
  END,
  COALESCE(NULLIF(m."sequence", 0), 1),
  p."createdAt",
  CASE WHEN p."status" IN ('ACCEPTED', 'INSTALLING', 'ACTIVE', 'COMPLETED') THEN COALESCE(p."acceptedAt", p."createdAt") ELSE NULL END,
  p."completedAt",
  p."createdAt",
  p."updatedAt"
FROM "Participant" p
JOIN "Mission" m ON m."id" = p."missionId"
WHERE p."missionId" IS NOT NULL
ON CONFLICT ("participantId", "missionId") DO NOTHING;

-- Move legacy milestone progress under the preserved assignment.
INSERT INTO "ParticipantMissionProgress" ("id", "participantMissionId", "milestoneId", "status", "note", "completedAt", "createdAt", "updatedAt")
SELECT
  pp."id",
  pm."id",
  pp."milestoneId",
  pp."status",
  pp."note",
  pp."completedAt",
  pp."createdAt",
  pp."updatedAt"
FROM "ParticipantProgress" pp
JOIN "ParticipantMission" pm ON pm."participantId" = pp."participantId"
JOIN "MissionMilestone" mm ON mm."id" = pp."milestoneId" AND mm."missionId" = pm."missionId"
ON CONFLICT ("participantMissionId", "milestoneId") DO NOTHING;

-- Attach existing invites to current preserved assignment where possible.
ALTER TABLE "Invite" ADD COLUMN "participantMissionId" TEXT;
UPDATE "Invite" i
SET "participantMissionId" = pm."id"
FROM "ParticipantMission" pm
WHERE pm."participantId" = i."participantId"
  AND pm."sequence" = (
    SELECT MIN(pm2."sequence") FROM "ParticipantMission" pm2 WHERE pm2."participantId" = i."participantId"
  );
CREATE INDEX "Invite_participantMissionId_idx" ON "Invite"("participantMissionId");
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_participantMissionId_fkey" FOREIGN KEY ("participantMissionId") REFERENCES "ParticipantMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Allow founder notes to optionally attach to an assignment.
ALTER TABLE "FounderNote" ADD COLUMN "participantMissionId" TEXT;
CREATE INDEX "FounderNote_participantMissionId_createdAt_idx" ON "FounderNote"("participantMissionId", "createdAt");
ALTER TABLE "FounderNote" ADD CONSTRAINT "FounderNote_participantMissionId_fkey" FOREIGN KEY ("participantMissionId") REFERENCES "ParticipantMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop legacy progress and mission FK after migration.
DROP TABLE "ParticipantProgress";
ALTER TABLE "Participant" DROP CONSTRAINT "Participant_missionId_fkey";
DROP INDEX "Participant_missionId_idx";
ALTER TABLE "Participant" DROP COLUMN "missionId";
