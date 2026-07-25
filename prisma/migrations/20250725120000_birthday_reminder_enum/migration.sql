-- AlterEnum: add new birthday reminder timings
ALTER TYPE "BirthdayReminderType" ADD VALUE 'DAY_BEFORE';
ALTER TYPE "BirthdayReminderType" ADD VALUE 'ONE_MONTH_BEFORE';
