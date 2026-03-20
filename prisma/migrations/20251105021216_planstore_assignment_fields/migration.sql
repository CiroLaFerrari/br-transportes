-- AlterTable
ALTER TABLE "PlanStore" ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "planEndAt" TIMESTAMP(3),
ADD COLUMN     "planStartAt" TIMESTAMP(3),
ADD COLUMN     "vehicleId" TEXT;

-- CreateIndex
CREATE INDEX "PlanStore_driverId_planStartAt_planEndAt_idx" ON "PlanStore"("driverId", "planStartAt", "planEndAt");

-- CreateIndex
CREATE INDEX "PlanStore_vehicleId_planStartAt_planEndAt_idx" ON "PlanStore"("vehicleId", "planStartAt", "planEndAt");
