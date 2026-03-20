/*
  Warnings:

  - You are about to drop the column `pesoKg` on the `Produto` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Coleta" ADD COLUMN     "volumeTotalM3" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Componente" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "quantidade" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "pesoKg" DROP NOT NULL,
ALTER COLUMN "compCm" DROP NOT NULL,
ALTER COLUMN "compCm" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "largCm" DROP NOT NULL,
ALTER COLUMN "largCm" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "altCm" DROP NOT NULL,
ALTER COLUMN "altCm" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Produto" DROP COLUMN "pesoKg",
ADD COLUMN     "areaM2" DOUBLE PRECISION,
ADD COLUMN     "embalado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tipoEmbalagem" TEXT,
ADD COLUMN     "volumeM3" DOUBLE PRECISION,
ALTER COLUMN "compCm" DROP NOT NULL,
ALTER COLUMN "compCm" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "largCm" DROP NOT NULL,
ALTER COLUMN "largCm" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "altCm" DROP NOT NULL,
ALTER COLUMN "altCm" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RoutePlan" ADD COLUMN     "planEndAt" TIMESTAMP(3),
ADD COLUMN     "planStartAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "capacityKg" DOUBLE PRECISION,
ADD COLUMN     "capacityM3" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Componente_produtoId_idx" ON "Componente"("produtoId");

-- CreateIndex
CREATE INDEX "RoutePlan_driverId_planStartAt_planEndAt_idx" ON "RoutePlan"("driverId", "planStartAt", "planEndAt");

-- CreateIndex
CREATE INDEX "RoutePlan_vehicleId_planStartAt_planEndAt_idx" ON "RoutePlan"("vehicleId", "planStartAt", "planEndAt");
