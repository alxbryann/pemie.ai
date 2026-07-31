-- Orden monotónico del historial: `createdAt` es el timestamp de transacción y
-- el par user+assistant de un turno lo comparte, así que no desempata dentro del par.
-- DropIndex
DROP INDEX "channel_messages_userId_provider_createdAt_idx";

-- AlterTable
ALTER TABLE "channel_messages" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "channel_messages_userId_provider_seq_idx" ON "channel_messages"("userId", "provider", "seq");

-- AlterTable: el default de columna también apuntaba a un modelo retirado, así que
-- cada config nueva nacía rota.
ALTER TABLE "user_channel_configs" ALTER COLUMN "model" SET DEFAULT 'claude-sonnet-5';

-- Remapea modelos retirados al default vigente de su proveedor: el catálogo es
-- cerrado, así que una fila con un modelo fuera de él dejaría al usuario con
-- respuestas 404 del proveedor y sin forma de escapar desde la UI.
UPDATE "user_channel_configs"
SET "model" = 'claude-sonnet-5'
WHERE "llmProvider" = 'anthropic'
  AND "model" NOT IN ('claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5');

UPDATE "user_channel_configs"
SET "model" = 'gpt-4o'
WHERE "llmProvider" = 'openai'
  AND "model" NOT IN ('gpt-4o', 'gpt-4o-mini');

UPDATE "user_channel_configs"
SET "model" = 'deepseek-chat'
WHERE "llmProvider" = 'deepseek'
  AND "model" NOT IN ('deepseek-chat', 'deepseek-reasoner');
