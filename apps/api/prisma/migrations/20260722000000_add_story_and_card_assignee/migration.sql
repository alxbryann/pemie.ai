-- AlterTable
ALTER TABLE "user_stories" ADD COLUMN "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "user_stories_assigneeId_idx" ON "user_stories"("assigneeId");

-- CreateIndex
CREATE INDEX "cards_assigneeId_idx" ON "cards"("assigneeId");

-- AddForeignKey
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "contributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "contributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
