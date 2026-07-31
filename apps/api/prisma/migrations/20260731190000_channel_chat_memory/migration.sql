-- AlterTable: resumen rolling del chat Telegram
ALTER TABLE "user_channel_configs" ADD COLUMN "conversationSummary" TEXT;

-- CreateTable: BYOK por proveedor
CREATE TABLE "channel_llm_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "llmKeyCiphertext" TEXT NOT NULL,
    "llmKeyLast4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_llm_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_llm_credentials_userId_provider_key" ON "channel_llm_credentials"("userId", "provider");
CREATE INDEX "channel_llm_credentials_userId_idx" ON "channel_llm_credentials"("userId");

ALTER TABLE "channel_llm_credentials" ADD CONSTRAINT "channel_llm_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill desde la key activa existente
INSERT INTO "channel_llm_credentials" ("id", "userId", "provider", "llmKeyCiphertext", "llmKeyLast4", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || "userId"),
  "userId",
  "llmProvider",
  "llmKeyCiphertext",
  COALESCE("llmKeyLast4", '????'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user_channel_configs"
WHERE "llmKeyCiphertext" IS NOT NULL;

-- CreateTable: historial de chat
CREATE TABLE "channel_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'telegram',
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "channel_messages_userId_provider_createdAt_idx" ON "channel_messages"("userId", "provider", "createdAt");

ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
