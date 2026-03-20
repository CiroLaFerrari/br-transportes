-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('PLANEJADA', 'ATRIBUIDA', 'EM_ROTA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StopStatus" AS ENUM ('PENDENTE', 'EM_ATENDIMENTO', 'ENTREGUE', 'FALHA');

-- AlterTable
ALTER TABLE "RoutePlan" ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" "RouteStatus" NOT NULL DEFAULT 'PLANEJADA',
ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "StopPlan" ADD COLUMN     "doneAt" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "status" "StopStatus" NOT NULL DEFAULT 'PENDENTE';

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "phone" TEXT,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plate" TEXT NOT NULL,
    "model" TEXT,
    "capacity" INTEGER,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE INDEX "RoutePlan_status_idx" ON "RoutePlan"("status");

-- CreateIndex
CREATE INDEX "RoutePlan_driverId_idx" ON "RoutePlan"("driverId");

-- CreateIndex
CREATE INDEX "RoutePlan_vehicleId_idx" ON "RoutePlan"("vehicleId");

-- CreateIndex
CREATE INDEX "StopPlan_status_idx" ON "StopPlan"("status");

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutePlan" ADD CONSTRAINT "RoutePlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
