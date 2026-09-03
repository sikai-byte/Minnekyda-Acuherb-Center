-- CreateEnum
CREATE TYPE "ClinicEventType" AS ENUM ('INTAKE_STARTED', 'INTAKE_SUBMITTED', 'NOTE_STARTED', 'NOTE_SIGNED', 'APPOINTMENT_BOOKED', 'APPOINTMENT_CHECKED_IN', 'APPOINTMENT_COMPLETED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_NO_SHOW');

-- CreateTable
CREATE TABLE "ClinicEvent" (
    "id" TEXT NOT NULL,
    "type" "ClinicEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER,
    "patientId" TEXT,
    "userId" TEXT,
    "appointmentId" TEXT,
    "submissionId" TEXT,
    "noteId" TEXT,
    "serviceId" TEXT,
    "roomId" TEXT,
    "source" "BookingSource",
    "minutes" INTEGER,

    CONSTRAINT "ClinicEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicEvent_type_occurredAt_idx" ON "ClinicEvent"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "ClinicEvent_occurredAt_idx" ON "ClinicEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "ClinicEvent_patientId_occurredAt_idx" ON "ClinicEvent"("patientId", "occurredAt");
