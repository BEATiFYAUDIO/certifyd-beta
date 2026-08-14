ALTER TABLE "Mission" ADD COLUMN "publicStartEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Mission" ADD COLUMN "startHeading" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Mission" ADD COLUMN "startIntro" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Mission" ADD COLUMN "publicInstructions" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Mission" ADD COLUMN "aiStarterPrompt" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Mission" ADD COLUMN "successCriteria" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ParticipantMission" ADD COLUMN "publicInstructionsOverride" TEXT NOT NULL DEFAULT '';
