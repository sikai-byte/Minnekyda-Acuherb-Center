-- Scheduling v2: the domain vocabulary the clinic actually uses, plus appointment history and
-- the capacity policy. The renames are in-place so no scheduling data is lost.

ALTER TABLE "Service" RENAME TO "AppointmentType";
ALTER INDEX "Service_pkey" RENAME TO "AppointmentType_pkey";
ALTER INDEX "Service_slug_key" RENAME TO "AppointmentType_slug_key";

ALTER TABLE "Room" RENAME TO "TreatmentRoom";
ALTER INDEX "Room_pkey" RENAME TO "TreatmentRoom_pkey";
ALTER INDEX "Room_name_key" RENAME TO "TreatmentRoom_name_key";

ALTER TABLE "AvailabilityRule" RENAME TO "PractitionerAvailability";
ALTER INDEX "AvailabilityRule_pkey" RENAME TO "PractitionerAvailability_pkey";
ALTER INDEX "AvailabilityRule_practitionerId_weekday_idx" RENAME TO "PractitionerAvailability_practitionerId_weekday_idx";
ALTER TABLE "PractitionerAvailability" RENAME CONSTRAINT "AvailabilityRule_practitionerId_fkey" TO "PractitionerAvailability_practitionerId_fkey";

ALTER TABLE "TimeOff" RENAME TO "ClinicClosure";
ALTER INDEX "TimeOff_pkey" RENAME TO "ClinicClosure_pkey";
ALTER TABLE "ClinicClosure" RENAME CONSTRAINT "TimeOff_practitionerId_fkey" TO "ClinicClosure_practitionerId_fkey";
DROP INDEX "TimeOff_startsAt_idx";
CREATE INDEX "ClinicClosure_startsAt_endsAt_idx" ON "ClinicClosure"("startsAt", "endsAt");
CREATE INDEX "ClinicClosure_practitionerId_startsAt_idx" ON "ClinicClosure"("practitionerId", "startsAt");

ALTER TABLE "Appointment" RENAME COLUMN "serviceId" TO "appointmentTypeId";
ALTER TABLE "Appointment" RENAME CONSTRAINT "Appointment_serviceId_fkey" TO "Appointment_appointmentTypeId_fkey";
ALTER TABLE "ClinicEvent" RENAME COLUMN "serviceId" TO "appointmentTypeId";

-- BOOKED was never a lifecycle state the clinic recognised; SCHEDULED is.
ALTER TYPE "AppointmentStatus" RENAME VALUE 'BOOKED' TO 'SCHEDULED';
ALTER TABLE "Appointment" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';

-- CreateEnum
CREATE TYPE "AppointmentEventType" AS ENUM ('CREATED', 'CONFIRMED', 'RESCHEDULED', 'ROOM_CHANGED', 'PRACTITIONER_CHANGED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "noShowAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClinicalNote" ADD COLUMN     "appointmentId" TEXT;

-- AlterTable
ALTER TABLE "TreatmentRoom" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SchedulingPolicy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "maxConcurrentPerPractitioner" INTEGER NOT NULL DEFAULT 1,
    "practitionerActiveMinutes" INTEGER,
    "slotStepMinutes" INTEGER NOT NULL DEFAULT 15,
    "selfBookingNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
    "selfCancelNoticeHours" INTEGER NOT NULL DEFAULT 24,
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 60,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type" "AppointmentEventType" NOT NULL,
    "actorId" TEXT,
    "actorRole" "Role",
    "source" "BookingSource",
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus",
    "fromStartsAt" TIMESTAMP(3),
    "toStartsAt" TIMESTAMP(3),
    "fromRoomId" TEXT,
    "toRoomId" TEXT,
    "fromPractitionerId" TEXT,
    "toPractitionerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentEvent_appointmentId_createdAt_idx" ON "AppointmentEvent"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentEvent_createdAt_idx" ON "AppointmentEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Appointment_roomId_startsAt_idx" ON "Appointment"("roomId", "startsAt");

-- CreateIndex
CREATE INDEX "Appointment_status_startsAt_idx" ON "Appointment"("status", "startsAt");

-- CreateIndex
CREATE INDEX "AppointmentType_active_idx" ON "AppointmentType"("active");

-- CreateIndex
CREATE INDEX "ClinicalNote_appointmentId_idx" ON "ClinicalNote"("appointmentId");

-- CreateIndex
CREATE INDEX "TreatmentRoom_active_position_idx" ON "TreatmentRoom"("active", "position");

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

