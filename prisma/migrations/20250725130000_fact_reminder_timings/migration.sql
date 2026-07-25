-- AlterTable Fact: add reminder timings, drop reminderSent
ALTER TABLE "Fact" ADD COLUMN "reminderTimings" "BirthdayReminderType"[] DEFAULT ARRAY[]::"BirthdayReminderType"[];

-- Backfill: facts with a reminder date default to ON_DAY (previous single-day behavior)
UPDATE "Fact"
SET "reminderTimings" = ARRAY['ON_DAY'::"BirthdayReminderType"]
WHERE "reminderDate" IS NOT NULL;

-- CreateTable FactReminderLog
CREATE TABLE "FactReminderLog" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "type" "BirthdayReminderType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FactReminderLog_pkey" PRIMARY KEY ("id")
);

-- Mark already-sent ON_DAY reminders in the log
INSERT INTO "FactReminderLog" ("id", "factId", "type", "sentAt")
SELECT 'migrated_' || "id", "id", 'ON_DAY'::"BirthdayReminderType", CURRENT_TIMESTAMP
FROM "Fact"
WHERE "reminderSent" = true AND "reminderDate" IS NOT NULL;

CREATE UNIQUE INDEX "FactReminderLog_factId_type_key" ON "FactReminderLog"("factId", "type");
CREATE INDEX "FactReminderLog_factId_idx" ON "FactReminderLog"("factId");

ALTER TABLE "FactReminderLog" ADD CONSTRAINT "FactReminderLog_factId_fkey" FOREIGN KEY ("factId") REFERENCES "Fact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "Fact_reminderDate_reminderSent_idx";
ALTER TABLE "Fact" DROP COLUMN "reminderSent";
CREATE INDEX "Fact_reminderDate_idx" ON "Fact"("reminderDate");
