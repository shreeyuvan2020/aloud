-- DropIndex
DROP INDEX "Session_assignmentId_idx";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "sessionKey" TEXT;

-- CreateIndex
CREATE INDEX "Session_assignmentId_createdAt_idx" ON "Session"("assignmentId", "createdAt");
