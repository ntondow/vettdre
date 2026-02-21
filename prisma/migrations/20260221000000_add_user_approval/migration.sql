-- AlterTable: Add is_approved column with default false
ALTER TABLE "users" ADD COLUMN "is_approved" BOOLEAN NOT NULL DEFAULT false;

-- Set all existing users to approved
UPDATE "users" SET "is_approved" = true;
