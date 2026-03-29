-- Add voiceEnabled to LeasingConfig
ALTER TABLE "leasing_configs" ADD COLUMN "voice_enabled" BOOLEAN NOT NULL DEFAULT false;
