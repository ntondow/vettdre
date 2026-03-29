-- Add web chat fields to leasing_configs
ALTER TABLE "leasing_configs" ADD COLUMN "web_chat_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leasing_configs" ADD COLUMN "slug" TEXT;

-- Unique index on slug
CREATE UNIQUE INDEX "leasing_configs_slug_key" ON "leasing_configs"("slug");
