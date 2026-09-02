-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'PATIENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "patientId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_patientId_key" ON "User"("patientId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

