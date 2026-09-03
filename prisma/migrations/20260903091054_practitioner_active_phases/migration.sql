/*
  Warnings:

  - You are about to drop the column `practitionerActiveMinutes` on the `SchedulingPolicy` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AppointmentType" ADD COLUMN     "practitionerCloseMinutes" INTEGER,
ADD COLUMN     "practitionerLeadMinutes" INTEGER;

-- AlterTable
ALTER TABLE "SchedulingPolicy" DROP COLUMN "practitionerActiveMinutes",
ADD COLUMN     "publicRequestsAutoConfirm" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "selfRescheduleNoticeHours" INTEGER NOT NULL DEFAULT 48;

-- The clinic's active phases for the visit types it already runs: the practitioner is in the
-- room for the first 30 and last 15 minutes of a first consultation and the first 15 and last
-- 15 of a treatment. Anything else keeps NULLs and is counted as needing the whole visit.
UPDATE "AppointmentType"
SET "practitionerLeadMinutes" = 30, "practitionerCloseMinutes" = 15
WHERE "firstVisit" = true;

UPDATE "AppointmentType"
SET "practitionerLeadMinutes" = 15, "practitionerCloseMinutes" = 15
WHERE "firstVisit" = false AND "minutes" >= 45;
