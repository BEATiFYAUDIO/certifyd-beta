ALTER TABLE "Invite" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invite" ADD COLUMN "publishedAt" TIMESTAMP(3);
CREATE INDEX "Invite_published_idx" ON "Invite"("published");
