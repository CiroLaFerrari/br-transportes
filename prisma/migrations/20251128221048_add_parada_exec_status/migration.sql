/*
  Warnings:

  - The values [FALHA] on the enum `StopStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "ParadaStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "ParadaExecStatus" AS ENUM ('PENDENTE', 'EM_ATENDIMENTO', 'ENTREGUE', 'FALHA');

-- AlterEnum
BEGIN;
CREATE TYPE "StopStatus_new" AS ENUM ('PENDENTE', 'EM_ATENDIMENTO', 'ENTREGUE');
ALTER TABLE "public"."StopPlan" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "StopPlan" ALTER COLUMN "status" TYPE "StopStatus_new" USING ("status"::text::"StopStatus_new");
ALTER TYPE "StopStatus" RENAME TO "StopStatus_old";
ALTER TYPE "StopStatus_new" RENAME TO "StopStatus";
DROP TYPE "public"."StopStatus_old";
ALTER TABLE "StopPlan" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';
COMMIT;

-- AlterTable
ALTER TABLE "Parada" ADD COLUMN     "checkinAt" TIMESTAMP(3),
ADD COLUMN     "checkoutAt" TIMESTAMP(3),
ADD COLUMN     "obsStatus" TEXT,
ADD COLUMN     "statusExec" "ParadaExecStatus" NOT NULL DEFAULT 'PENDENTE';

-- CreateIndex
CREATE INDEX "Parada_statusExec_idx" ON "Parada"("statusExec");
