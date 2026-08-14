ALTER TABLE "MissionMilestone" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "MissionMilestone_missionId_active_sortOrder_idx" ON "MissionMilestone"("missionId", "active", "sortOrder");
