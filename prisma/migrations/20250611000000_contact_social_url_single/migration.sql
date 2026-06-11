-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "socialUrl" TEXT;

UPDATE "Contact"
SET "socialUrl" = COALESCE("facebookUrl", "instagramUrl", "linkedinUrl")
WHERE "socialUrl" IS NULL;

ALTER TABLE "Contact" DROP COLUMN "facebookUrl",
DROP COLUMN "instagramUrl",
DROP COLUMN "linkedinUrl";
