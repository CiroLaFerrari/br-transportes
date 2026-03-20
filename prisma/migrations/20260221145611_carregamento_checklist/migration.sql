/*
  Warnings:

  - You are about to drop the `CarregamentoConferencia` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CarregamentoItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('ABERTO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDENTE', 'OK', 'FALHA');

-- DropForeignKey
ALTER TABLE "public"."CarregamentoConferencia" DROP CONSTRAINT "CarregamentoConferencia_minutaId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CarregamentoItem" DROP CONSTRAINT "CarregamentoItem_conferenciaId_fkey";

-- DropTable
DROP TABLE "public"."CarregamentoConferencia";

-- DropTable
DROP TABLE "public"."CarregamentoItem";

-- DropEnum
DROP TYPE "public"."CarregamentoItemStatus";

-- DropEnum
DROP TYPE "public"."CarregamentoStatus";

-- CreateTable
CREATE TABLE "CarregamentoChecklist" (
    "id" TEXT NOT NULL,
    "minutaId" TEXT NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'ABERTO',
    "conferente" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarregamentoChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarregamentoChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDENTE',
    "note" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarregamentoChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CarregamentoChecklist_minutaId_key" ON "CarregamentoChecklist"("minutaId");

-- CreateIndex
CREATE INDEX "CarregamentoChecklist_status_idx" ON "CarregamentoChecklist"("status");

-- CreateIndex
CREATE INDEX "CarregamentoChecklist_minutaId_idx" ON "CarregamentoChecklist"("minutaId");

-- CreateIndex
CREATE INDEX "CarregamentoChecklistItem_checklistId_idx" ON "CarregamentoChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "CarregamentoChecklistItem_volumeId_idx" ON "CarregamentoChecklistItem"("volumeId");

-- CreateIndex
CREATE INDEX "CarregamentoChecklistItem_status_idx" ON "CarregamentoChecklistItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CarregamentoChecklistItem_checklistId_volumeId_key" ON "CarregamentoChecklistItem"("checklistId", "volumeId");

-- AddForeignKey
ALTER TABLE "CarregamentoChecklist" ADD CONSTRAINT "CarregamentoChecklist_minutaId_fkey" FOREIGN KEY ("minutaId") REFERENCES "MinutaConferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarregamentoChecklistItem" ADD CONSTRAINT "CarregamentoChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "CarregamentoChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarregamentoChecklistItem" ADD CONSTRAINT "CarregamentoChecklistItem_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "MinutaVolume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
