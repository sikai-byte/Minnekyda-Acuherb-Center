-- CreateEnum
CREATE TYPE "EmailKind" AS ENUM ('APPOINTMENT_BOOKED', 'APPOINTMENT_REQUESTED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_REMINDER', 'PORTAL_INVITE', 'STAFF_INVITE');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "to" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "patientId" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailMessage_appointmentId_kind_idx" ON "EmailMessage"("appointmentId", "kind");

-- CreateIndex
CREATE INDEX "EmailMessage_patientId_createdAt_idx" ON "EmailMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");
