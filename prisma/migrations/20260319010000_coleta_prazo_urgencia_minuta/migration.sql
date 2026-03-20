-- CreateEnum
CREATE TYPE "UrgenciaColeta" AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

-- AlterTable
ALTER TABLE "Coleta" ADD COLUMN "prazoEntrega" TIMESTAMP(3);
ALTER TABLE "Coleta" ADD COLUMN "urgencia" "UrgenciaColeta" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "Coleta" ADD COLUMN "minutaId" TEXT;

-- CreateIndex
CREATE INDEX "Coleta_minutaId_idx" ON "Coleta"("minutaId");
