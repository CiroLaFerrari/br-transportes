/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `dtCarregamento` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `dtEntradaPatio` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `dtEntrega` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `dtSaidaPatio` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `volumeTotalM3` on the `Coleta` table. All the data in the column will be lost.
  - You are about to drop the column `cidade` on the `Parada` table. All the data in the column will be lost.
  - You are about to drop the column `uf` on the `Parada` table. All the data in the column will be lost.
  - Added the required column `label` to the `Parada` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lat` to the `Parada` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lon` to the `Parada` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Coleta" DROP CONSTRAINT "Coleta_clienteId_fkey";

-- AlterTable
ALTER TABLE "Coleta" DROP COLUMN "createdAt",
DROP COLUMN "dtCarregamento",
DROP COLUMN "dtEntradaPatio",
DROP COLUMN "dtEntrega",
DROP COLUMN "dtSaidaPatio",
DROP COLUMN "status",
DROP COLUMN "updatedAt",
DROP COLUMN "volumeTotalM3",
ALTER COLUMN "clienteId" DROP NOT NULL,
ALTER COLUMN "valorFrete" DROP NOT NULL,
ALTER COLUMN "pesoTotalKg" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Parada" DROP COLUMN "cidade",
DROP COLUMN "uf",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "durMinTrecho" INTEGER,
ADD COLUMN     "kmTrecho" DOUBLE PRECISION,
ADD COLUMN     "label" TEXT NOT NULL,
ADD COLUMN     "lat" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "lon" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "planejamentoId" TEXT,
ALTER COLUMN "rotaId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Parada_planejamentoId_ordem_idx" ON "Parada"("planejamentoId", "ordem");

-- CreateIndex
CREATE INDEX "Parada_rotaId_ordem_idx" ON "Parada"("rotaId", "ordem");

-- AddForeignKey
ALTER TABLE "Coleta" ADD CONSTRAINT "Coleta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parada" ADD CONSTRAINT "Parada_planejamentoId_fkey" FOREIGN KEY ("planejamentoId") REFERENCES "Planejamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
