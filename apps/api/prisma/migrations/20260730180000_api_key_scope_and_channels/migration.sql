-- AlterTable ApiKey: multi-alcance
ALTER TABLE "api_keys" ADD COLUMN "scopeLevel" TEXT NOT NULL DEFAULT 'project';
ALTER TABLE "api_keys" ADD COLUMN "ownerUserId" TEXT;

CREATE INDEX "api_keys_ownerUserId_idx" ON "api_keys"("ownerUserId");

ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ChannelLink
CREATE TABLE "channel_links" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'telegram',
    "externalId" TEXT NOT NULL,
    "username" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_links_provider_externalId_key" ON "channel_links"("provider", "externalId");
CREATE UNIQUE INDEX "channel_links_userId_provider_key" ON "channel_links"("userId", "provider");
CREATE INDEX "channel_links_userId_idx" ON "channel_links"("userId");

ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserChannelConfig
CREATE TABLE "user_channel_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "llmKeyCiphertext" TEXT,
    "llmKeyLast4" TEXT,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    "defaultProjectId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_channel_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_channel_configs_userId_key" ON "user_channel_configs"("userId");
CREATE UNIQUE INDEX "user_channel_configs_apiKeyId_key" ON "user_channel_configs"("apiKeyId");

ALTER TABLE "user_channel_configs" ADD CONSTRAINT "user_channel_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_channel_configs" ADD CONSTRAINT "user_channel_configs_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_channel_configs" ADD CONSTRAINT "user_channel_configs_defaultProjectId_fkey" FOREIGN KEY ("defaultProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ChannelLinkToken
CREATE TABLE "channel_link_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_link_tokens_token_key" ON "channel_link_tokens"("token");
CREATE INDEX "channel_link_tokens_token_idx" ON "channel_link_tokens"("token");
CREATE INDEX "channel_link_tokens_userId_idx" ON "channel_link_tokens"("userId");

ALTER TABLE "channel_link_tokens" ADD CONSTRAINT "channel_link_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
