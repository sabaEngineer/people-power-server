-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "birthdayReminders" "BirthdayReminderType"[] DEFAULT ARRAY[]::"BirthdayReminderType"[];

-- Backfill existing contacts with a birthday to previous default behavior
UPDATE "Contact"
SET "birthdayReminders" = ARRAY['ON_DAY'::"BirthdayReminderType", 'ONE_WEEK_BEFORE'::"BirthdayReminderType"]
WHERE "birthday" IS NOT NULL;
