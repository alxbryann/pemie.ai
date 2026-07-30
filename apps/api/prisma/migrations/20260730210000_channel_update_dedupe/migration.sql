-- ChannelUpdate: idempotencia de webhooks entrantes + rate limit distribuido
CREATE TABLE "channel_updates" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'telegram',
    "updateId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_updates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_updates_provider_updateId_key" ON "channel_updates"("provider", "updateId");
CREATE INDEX "channel_updates_provider_externalId_createdAt_idx" ON "channel_updates"("provider", "externalId", "createdAt");
CREATE INDEX "channel_updates_createdAt_idx" ON "channel_updates"("createdAt");
