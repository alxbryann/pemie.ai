-- AlterTable: assigneeId en HUs y tarjetas.
-- (IF NOT EXISTS por estado parcial previo en algunos entornos; incluye el
--  ADD COLUMN de "cards" que faltaba en la versión original de esta migración.)
ALTER TABLE "user_stories" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
ALTER TABLE "cards" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_stories_assigneeId_idx" ON "user_stories"("assigneeId");
CREATE INDEX IF NOT EXISTS "cards_assigneeId_idx" ON "cards"("assigneeId");

-- AddForeignKey
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "contributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cards" ADD CONSTRAINT "cards_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "contributors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
